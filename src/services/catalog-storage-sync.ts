import sharp from "sharp";
import type { DriveAuthClient } from "@/lib/drive-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchDriveFileAsImageBuffer,
  fetchDriveThumbnailJpeg,
} from "@/lib/drive-download-buffer";
import { withRetry } from "@/lib/retry";
import { sourceDriveFileId } from "@/lib/size-stock-name";
import {
  CATALOG_STORAGE_BUCKET,
  catalogProductStoragePath,
} from "@/lib/storage-constants";

type AdminClient = SupabaseClient;

const MAX_WIDTH = 1600;

async function toCatalogJpegBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: MAX_WIDTH,
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 88,
      mozjpeg: true,
      chromaSubsampling: "4:2:0",
      progressive: true,
    })
    .toBuffer();
}

export type ImageSyncItem = {
  id: string;
  drive_file_id: string;
  /** ISO modifiedTime do Drive nesta varredura */
  driveModifiedIso: string;
  /** md5Checksum do ficheiro de origem. Null se o Drive não devolver. */
  driveMd5: string | null;
};

/**
 * Descarrega do Drive, envia ao Storage, grava `image_url`, `drive_updated_at`, `drive_md5`, `sync_status=done`.
 * Vários tamanhos do mesmo ficheiro (`id~38`, `id~40`) partilham um único JPEG.
 */
export async function syncImageGroupToStorage(
  admin: AdminClient,
  items: ImageSyncItem[],
  driveAuth?: DriveAuthClient
): Promise<void> {
  if (items.length === 0) return;
  const sourceId = sourceDriveFileId(items[0]!.drive_file_id);
  const { buffer } = await fetchDriveFileAsImageBuffer(sourceId, driveAuth);
  let jpeg: Buffer;
  try {
    jpeg = await toCatalogJpegBuffer(buffer);
  } catch (decodeErr) {
    if (!driveAuth) throw decodeErr;
    const thumb = await fetchDriveThumbnailJpeg(sourceId, driveAuth).catch(
      () => null
    );
    if (!thumb) throw decodeErr;
    jpeg = await toCatalogJpegBuffer(thumb);
  }
  const path = catalogProductStoragePath(sourceId);

  await withRetry(
    async () => {
      const { error: upErr } = await admin.storage
        .from(CATALOG_STORAGE_BUCKET)
        .upload(path, jpeg, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (upErr) {
        throw new Error(upErr.message);
      }
    },
    { label: `storage-upload:${sourceId}`, attempts: 4, baseDelayMs: 700 }
  );

  const { data: pub } = admin.storage
    .from(CATALOG_STORAGE_BUCKET)
    .getPublicUrl(path);

  const publicUrl = pub.publicUrl;
  if (!publicUrl) {
    throw new Error("URL pública indisponível");
  }

  await withRetry(
    async () => {
      const md5 = items[0]!.driveMd5?.trim() || null;
      const { error: dbErr } = await admin
        .from("products")
        .update({
          image_url: publicUrl,
          drive_updated_at: items[0]!.driveModifiedIso,
          ...(md5 ? { drive_md5: md5 } : {}),
          sync_status: "done",
        })
        .in(
          "id",
          items.map((item) => item.id)
        );
      if (dbErr) {
        throw new Error(dbErr.message);
      }
    },
    { label: `products-update:${sourceId}`, attempts: 4, baseDelayMs: 700 }
  );
}

/** Um produto. Variantes do mesmo ficheiro devem ir juntas em `syncImageGroupToStorage`. */
export async function syncOneProductImageToStorage(
  admin: AdminClient,
  item: ImageSyncItem,
  driveAuth?: DriveAuthClient
): Promise<void> {
  await syncImageGroupToStorage(admin, [item], driveAuth);
}

export async function markProductImageSyncError(
  admin: AdminClient,
  productId: string
): Promise<void> {
  await admin
    .from("products")
    .update({ sync_status: "error" })
    .eq("id", productId);
}

/** Remove JPEGs do Storage quando o produto deixa de existir no Drive. */
export async function deleteStorageForDriveFileIds(
  admin: AdminClient,
  driveFileIds: string[]
): Promise<number> {
  const sources = Array.from(
    new Set(
      driveFileIds
        .map((id) => sourceDriveFileId(id.trim()))
        .filter((id) => /^[A-Za-z0-9_-]+$/.test(id))
    )
  );
  const stillUsed = new Set<string>();
  for (const source of sources) {
    const [exact, variants] = await Promise.all([
      admin.from("products").select("id").eq("drive_file_id", source).limit(1),
      admin
        .from("products")
        .select("id")
        .like("drive_file_id", `${source}~%`)
        .limit(1),
    ]);
    if (exact.error) throw new Error(exact.error.message);
    if (variants.error) throw new Error(variants.error.message);
    if ((exact.data ?? []).length > 0 || (variants.data ?? []).length > 0) {
      stillUsed.add(source);
    }
  }
  const paths = sources
    .filter((id) => !stillUsed.has(id))
    .map((id) => catalogProductStoragePath(id));
  if (paths.length === 0) return 0;

  let removed = 0;
  const CHUNK = 50;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    const { error } = await admin.storage
      .from(CATALOG_STORAGE_BUCKET)
      .remove(slice);
    if (error) {
      throw new Error(error.message);
    }
    removed += slice.length;
  }
  return removed;
}
