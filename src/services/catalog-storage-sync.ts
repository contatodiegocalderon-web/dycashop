import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDriveFileAsImageBuffer } from "@/lib/drive-download-buffer";
import { CATALOG_STORAGE_BUCKET } from "@/lib/storage-constants";

type AdminClient = ReturnType<typeof createAdminClient>;

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
};

/**
 * Descarrega do Drive, envia ao Storage, grava `image_url`, `drive_updated_at`, `sync_status=done`.
 */
export async function syncOneProductImageToStorage(
  admin: AdminClient,
  item: ImageSyncItem
): Promise<void> {
  const { buffer } = await fetchDriveFileAsImageBuffer(item.drive_file_id);
  const jpeg = await toCatalogJpegBuffer(buffer);
  const path = `products/${item.drive_file_id}.jpg`;

  const { error: upErr } = await admin.storage
    .from(CATALOG_STORAGE_BUCKET)
    .upload(path, jpeg, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (upErr) {
    throw new Error(upErr.message);
  }

  const { data: pub } = admin.storage
    .from(CATALOG_STORAGE_BUCKET)
    .getPublicUrl(path);

  const publicUrl = pub.publicUrl;
  if (!publicUrl) {
    throw new Error("URL pública indisponível");
  }

  const { error: dbErr } = await admin
    .from("products")
    .update({
      image_url: publicUrl,
      drive_updated_at: item.driveModifiedIso,
      sync_status: "done",
    })
    .eq("id", item.id);

  if (dbErr) {
    throw new Error(dbErr.message);
  }
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
