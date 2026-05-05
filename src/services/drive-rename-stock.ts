import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDriveAuthorized, getDriveAuth } from "@/lib/drive-auth";
import { IMAGE_FILENAME_EXT, stripImageExtension } from "@/lib/parse-filename";
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

function uniqueSuffixFromFileId(fileId: string): string {
  const alnum = fileId.replace(/[^a-zA-Z0-9]/g, "");
  return alnum.slice(-6) || "id";
}

/**
 * Após venda, alinha o nome do ficheiro no Drive ao stock atual (último número no padrão MARCA COR N).
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
  let drive: ReturnType<typeof google.drive>;
  try {
    const auth = await getDriveAuth();
    await ensureDriveAuthorized(auth);
    drive = google.drive({ version: "v3", auth });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Drive não configurado";
    for (const id of productIds) {
      errors.push({ productId: id, message: msg });
    }
    return { ok, errors };
  }

  for (const productId of productIds) {
    try {
      const { data: p, error } = await admin
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (error || !p) {
        errors.push({
          productId,
          message: error?.message ?? "Produto não encontrado",
        });
        continue;
      }

      const product = p as Product;

      const meta = await drive.files.get({
        fileId: product.drive_file_id,
        fields: "name",
        supportsAllDrives: true,
      });

      const currentFullName = meta.data.name ?? "";
      const extMatch = currentFullName.match(IMAGE_FILENAME_EXT);
      const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";

      const baseName = `${product.brand} ${product.color} ${product.stock}`;
      let newFullName = `${baseName}${ext}`;

      if (newFullName === currentFullName) {
        ok.push(productId);
        continue;
      }

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
          throw new Error(`${msg1} · segundo intento: ${googleErrMessage(e2)}`);
        }
      }

      const baseLabel = stripImageExtension(newFullName);
      await admin
        .from("products")
        .update({ original_file_name: baseLabel })
        .eq("id", productId);

      ok.push(productId);
    } catch (e) {
      const msg = googleErrMessage(e);
      errors.push({ productId, message: msg });
    }
  }

  return { ok, errors };
}
