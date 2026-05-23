/** Bucket público para imagens do catálogo (Supabase Storage). */
export const CATALOG_STORAGE_BUCKET = "catalog-images";

export function catalogProductStoragePath(driveFileId: string): string {
  return `products/${driveFileId.trim()}.jpg`;
}
