import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDriveAuthorized, getDriveAuth } from "@/lib/drive-auth";
import { isReadyMadeKitProduct } from "@/lib/kits-category";
import { IMAGE_FILENAME_EXT, stripImageExtension } from "@/lib/parse-filename";
import {
  formatSizeStockGrid,
  isSizeVariantDriveId,
  parseSizeStockGrid,
  sourceDriveFileId,
} from "@/lib/size-stock-name";
import type { Product } from "@/types";

function googleErrMessage(e: unknown): string {
  const err = e as {
    message?: string;
    response?: { data?: { error?: { message?: string } } };
    errors?: { message?: string }[];
  };
  const api =
    err.response?.data?.error?.message ??
    err.errors?.[0]?.message ??
    err.message;
  return typeof api === "string" ? api : "Erro ao renomear no Drive";
}

function isNotFoundError(e: unknown): boolean {
  const msg = googleErrMessage(e).toLowerCase();
  return msg.includes("not found") || msg.includes("file not found");
}

function uniqueSuffixFromFileId(fileId: string): string {
  const alnum = fileId.replace(/[^a-zA-Z0-9]/g, "");
  return alnum.slice(-6) || "id";
}

export function expectedDriveFileName(
  product: Pick<Product, "brand" | "color" | "stock">,
  stockOverride?: number
): string {
  const stock = stockOverride ?? product.stock;
  return `${product.brand} ${product.color} ${stock}`;
}

function normalizedDriveBase(name: string): string {
  return stripImageExtension(name).trim().replace(/\s+/g, " ");
}

/** Nome no Drive já reflecte o stock actual na base (evita renomear de novo). */
export function isDriveNameSyncedToStock(
  driveFullName: string,
  product: Pick<Product, "brand" | "color" | "stock">
): boolean {
  const expected = normalizedDriveBase(expectedDriveFileName(product));
  const current = normalizedDriveBase(driveFullName);
  return current === expected;
}

type RenameRollback = {
  kind: "rename";
  productId: string;
  fileId: string;
  previousDriveName: string;
  previousOriginalFileName: string;
};

type DeleteRollback = {
  kind: "delete";
  productId: string;
  fileId: string;
  previousDriveName: string;
  previousOriginalFileName: string;
};

type DriveOp = RenameRollback | DeleteRollback;

async function rollbackDriveOps(
  drive: ReturnType<typeof google.drive>,
  admin: ReturnType<typeof createAdminClient>,
  ops: DriveOp[]
): Promise<string[]> {
  const rollbackErrors: string[] = [];
  for (const op of [...ops].reverse()) {
    try {
      if (op.kind === "rename") {
        await drive.files.update({
          fileId: op.fileId,
          requestBody: { name: op.previousDriveName },
          supportsAllDrives: true,
        });
        await admin
          .from("products")
          .update({ original_file_name: op.previousOriginalFileName })
          .eq("id", op.productId);
      } else {
        // Restaura ficheiro apagado com o mesmo ID não é possível via API padrão.
        rollbackErrors.push(
          `Produto ${op.productId}: ficheiro foi apagado no Drive e não pode ser restaurado automaticamente (ID ${op.fileId}).`
        );
      }
    } catch (e) {
      rollbackErrors.push(
        `Produto ${op.productId}: falha ao reverter Drive — ${googleErrMessage(e)}`
      );
    }
  }
  return rollbackErrors;
}

/**
 * Após venda:
 * - stock > 0: alinha o nome do ficheiro no Drive ao stock atual (MARCA COR N)
 * - stock <= 0: remove o ficheiro do Drive (produto esgotado)
 *
 * Em falha parcial, reverte renomeações já feitas (não reverte apagamentos).
 */
export async function renameDriveFilesToCurrentStock(
  productIds: string[]
): Promise<{ ok: string[]; errors: { productId: string; message: string }[] }> {
  const ok: string[] = [];
  const errors: { productId: string; message: string }[] = [];

  if (productIds.length === 0) {
    return { ok, errors };
  }

  const admin = createAdminClient();
  const products: Product[] = [];
  for (const productId of productIds) {
    const { data: p, error } = await admin
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    if (error || !p) {
      ok.push(productId);
      continue;
    }
    const row = p as Product;
    // KITs PRONTOS não têm ficheiro no Drive: a venda só baixa o estoque do site.
    if (isReadyMadeKitProduct(row)) {
      ok.push(row.id);
      continue;
    }
    products.push(row);
  }

  if (products.length === 0) {
    return { ok, errors };
  }

  let drive: ReturnType<typeof google.drive>;
  try {
    const auth = await getDriveAuth();
    await ensureDriveAuthorized(auth);
    drive = google.drive({ version: "v3", auth });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Drive não configurado";
    for (const id of productIds) {
      if (!ok.includes(id)) errors.push({ productId: id, message: msg });
    }
    return { ok, errors };
  }

  const plainProducts = products.filter(
    (p) => !isSizeVariantDriveId(p.drive_file_id)
  );
  const variantSources = new Set(
    products
      .filter((p) => isSizeVariantDriveId(p.drive_file_id))
      .map((p) => sourceDriveFileId(p.drive_file_id))
  );

  const toRename = plainProducts.filter((p) => p.stock > 0);
  const toDelete = plainProducts.filter((p) => p.stock <= 0);
  const completedOps: DriveOp[] = [];

  const failAll = async (
    productId: string,
    message: string
  ): Promise<{ ok: string[]; errors: { productId: string; message: string }[] }> => {
    const rollbackErrors = await rollbackDriveOps(drive, admin, completedOps);
    const outErrors: { productId: string; message: string }[] = [
      { productId, message },
    ];
    for (const id of productIds) {
      if (id !== productId && !ok.includes(id)) {
        const already = outErrors.some((e) => e.productId === id);
        if (!already) {
          outErrors.push({
            productId: id,
            message: "Cancelado — outro produto falhou antes deste.",
          });
        }
      }
    }
    if (rollbackErrors.length > 0) {
      outErrors.push({
        productId: "_rollback",
        message: `Aviso ao reverter Drive: ${rollbackErrors.join(" | ")}`,
      });
    }
    return { ok: [], errors: outErrors };
  };

  for (const sourceId of Array.from(variantSources)) {
    const touched = products.filter(
      (p) => sourceDriveFileId(p.drive_file_id) === sourceId
    );
    const lead = touched[0];
    if (!lead) continue;
    try {
      let currentFullName = "";
      try {
        const meta = await drive.files.get({
          fileId: sourceId,
          fields: "name",
          supportsAllDrives: true,
        });
        currentFullName = meta.data.name ?? "";
      } catch (e) {
        if (isNotFoundError(e)) {
          for (const p of touched) ok.push(p.id);
          continue;
        }
        return failAll(lead.id, googleErrMessage(e));
      }

      const extMatch = currentFullName.match(IMAGE_FILENAME_EXT);
      const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";
      const currentGrid = parseSizeStockGrid(currentFullName);
      if (!currentGrid) {
        return failAll(
          lead.id,
          "O nome no Drive não lista os tamanhos (ex.: 38-4/40-5). Não alterei o ficheiro."
        );
      }
      const stockBySize = new Map<string, number>();
      for (const cell of currentGrid?.cells ?? []) {
        stockBySize.set(cell.size, cell.stock);
      }
      for (const p of touched) {
        stockBySize.set(p.size, p.stock);
      }
      const nextBase = formatSizeStockGrid(
        Array.from(stockBySize, ([size, stock]) => ({ size, stock })),
        currentGrid?.labelPrefix
      );

      if (!nextBase) {
        await drive.files.delete({
          fileId: sourceId,
          supportsAllDrives: true,
        });
        completedOps.push({
          kind: "delete",
          productId: lead.id,
          fileId: sourceId,
          previousDriveName: currentFullName,
          previousOriginalFileName: lead.original_file_name,
        });
        for (const p of touched) ok.push(p.id);
        continue;
      }

      const newFullName = `${nextBase}${ext}`;
      if (stripImageExtension(currentFullName) !== nextBase) {
        await drive.files.update({
          fileId: sourceId,
          requestBody: { name: newFullName },
          supportsAllDrives: true,
        });
        completedOps.push({
          kind: "rename",
          productId: lead.id,
          fileId: sourceId,
          previousDriveName: currentFullName,
          previousOriginalFileName: lead.original_file_name,
        });
        const siblingIds = touched.map((p) => p.id);
        await admin
          .from("products")
          .update({ original_file_name: nextBase })
          .in("id", siblingIds);
      }

      for (const p of touched) ok.push(p.id);
    } catch (e) {
      return failAll(lead.id, googleErrMessage(e));
    }
  }

  for (const product of toRename) {
    try {
      const meta = await drive.files.get({
        fileId: product.drive_file_id,
        fields: "name",
        supportsAllDrives: true,
      });

      const currentFullName = meta.data.name ?? "";
      const extMatch = currentFullName.match(IMAGE_FILENAME_EXT);
      const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";
      const baseName = expectedDriveFileName(product);
      let newFullName = `${baseName}${ext}`;

      if (
        newFullName === currentFullName ||
        isDriveNameSyncedToStock(currentFullName, product)
      ) {
        ok.push(product.id);
        continue;
      }

      const previousOriginalFileName = product.original_file_name;
      const tryRename = async (name: string) => {
        await drive.files.update({
          fileId: product.drive_file_id,
          requestBody: { name },
          supportsAllDrives: true,
        });
      };

      try {
        await tryRename(newFullName);
      } catch (e1) {
        const msg1 = googleErrMessage(e1);
        const suffix = uniqueSuffixFromFileId(product.drive_file_id);
        const altName = `${baseName} ${suffix}${ext}`;
        try {
          await tryRename(altName);
          newFullName = altName;
        } catch (e2) {
          const msg = `${msg1} · segundo intento: ${googleErrMessage(e2)}`;
          return failAll(product.id, msg);
        }
      }

      completedOps.push({
        kind: "rename",
        productId: product.id,
        fileId: product.drive_file_id,
        previousDriveName: currentFullName,
        previousOriginalFileName,
      });

      const baseLabel = stripImageExtension(newFullName);
      await admin
        .from("products")
        .update({ original_file_name: baseLabel })
        .eq("id", product.id);

      ok.push(product.id);
    } catch (e) {
      const msg = googleErrMessage(e);
      return failAll(product.id, msg);
    }
  }

  for (const product of toDelete) {
    try {
      let previousDriveName = "";
      try {
        const meta = await drive.files.get({
          fileId: product.drive_file_id,
          fields: "name",
          supportsAllDrives: true,
        });
        previousDriveName = meta.data.name ?? "";
      } catch (e) {
        if (!isNotFoundError(e)) {
          return failAll(product.id, googleErrMessage(e));
        }
        ok.push(product.id);
        continue;
      }

      await drive.files.delete({
        fileId: product.drive_file_id,
        supportsAllDrives: true,
      });

      completedOps.push({
        kind: "delete",
        productId: product.id,
        fileId: product.drive_file_id,
        previousDriveName,
        previousOriginalFileName: product.original_file_name,
      });

      ok.push(product.id);
    } catch (e) {
      const msg = googleErrMessage(e);
      const rollbackErrors = await rollbackDriveOps(drive, admin, completedOps);
      errors.push({ productId: product.id, message: msg });
      if (rollbackErrors.length > 0) {
        errors.push({
          productId: "_rollback",
          message: rollbackErrors.join(" | "),
        });
      }
      return { ok, errors };
    }
  }

  return { ok, errors };
}
