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
 * Após venda:
 * - stock > 0: alinha o nome do ficheiro no Drive ao stock atual (MARCA COR N)
 * - stock <= 0: remove o ficheiro do Drive (produto esgotado)
 */
export async function renameDriveFilesToCurrentStock(
  productIds: string[]
): Promise<{ ok: string[]; errors: { productId: string; message: string }[] }> {
  const ok: string[] = [];
  const errors: { productId: string; message: string }[] = [];

  if (productIds.length === 0) {
    return { ok, errors };
  }

  // #region agent log
  fetch("http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "c8fae6",
    },
    body: JSON.stringify({
      sessionId: "c8fae6",
      location: "drive-rename-stock.ts:renameDriveFilesToCurrentStock",
      message: "entry",
      data: { productIdCount: productIds.length, hypothesisId: "H1" },
      timestamp: Date.now(),
      hypothesisId: "H1",
    }),
  }).catch(() => {});
  // #endregion

  const admin = createAdminClient();
  let drive: ReturnType<typeof google.drive>;
  try {
    const auth = await getDriveAuth();
    await ensureDriveAuthorized(auth);
    drive = google.drive({ version: "v3", auth });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Drive não configurado";
    // #region agent log
    fetch("http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "c8fae6",
      },
      body: JSON.stringify({
        sessionId: "c8fae6",
        location: "drive-rename-stock.ts:drive_auth",
        message: "drive_client_failed",
        data: { msg, hypothesisId: "H1" },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {});
    // #endregion
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
        // #region agent log
        fetch(
          "http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "c8fae6",
            },
            body: JSON.stringify({
              sessionId: "c8fae6",
              location: "drive-rename-stock.ts:product_fetch",
              message: "supabase_product_missing",
              data: {
                productId,
                supabaseError: error?.message ?? null,
                hypothesisId: "H4",
              },
              timestamp: Date.now(),
              hypothesisId: "H4",
            }),
          }
        ).catch(() => {});
        // #endregion
        errors.push({
          productId,
          message: error?.message ?? "Produto não encontrado",
        });
        continue;
      }

      const product = p as Product;
      if (product.stock <= 0) {
        await drive.files.delete({
          fileId: product.drive_file_id,
          supportsAllDrives: true,
        });
        ok.push(productId);
        continue;
      }

      // #region agent log
      fetch("http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "c8fae6",
        },
        body: JSON.stringify({
          sessionId: "c8fae6",
          location: "drive-rename-stock.ts:before_files_get",
          message: "product_loaded",
          data: {
            productId,
            driveFileIdLen: product.drive_file_id?.length ?? 0,
            stock: product.stock,
            hypothesisId: "H4",
          },
          timestamp: Date.now(),
          hypothesisId: "H4",
        }),
      }).catch(() => {});
      // #endregion

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

      // #region agent log
      fetch("http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "c8fae6",
        },
        body: JSON.stringify({
          sessionId: "c8fae6",
          location: "drive-rename-stock.ts:rename_targets",
          message: "will_rename",
          data: {
            productId,
            currentFullName,
            newFullName,
            hypothesisId: "H3-H5",
          },
          timestamp: Date.now(),
          hypothesisId: "H3-H5",
        }),
      }).catch(() => {});
      // #endregion

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
        // #region agent log
        fetch(
          "http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "c8fae6",
            },
            body: JSON.stringify({
              sessionId: "c8fae6",
              location: "drive-rename-stock.ts:first_rename_fail",
              message: "files_update_fail_primary",
              data: {
                productId,
                msg1,
                hypothesisId: "H3-H5",
              },
              timestamp: Date.now(),
              hypothesisId: "H3-H5",
            }),
          }
        ).catch(() => {});
        // #endregion
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
      // #region agent log
      fetch("http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "c8fae6",
        },
        body: JSON.stringify({
          sessionId: "c8fae6",
          location: "drive-rename-stock.ts:product_loop_catch",
          message: "rename_or_get_failed",
          data: {
            productId,
            msg,
            hypothesisId: "H2-H5",
          },
          timestamp: Date.now(),
          hypothesisId: "H2-H5",
        }),
      }).catch(() => {});
      // #endregion
      errors.push({ productId, message: msg });
    }
  }

  return { ok, errors };
}
