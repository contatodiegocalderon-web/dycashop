import { publicDriveImageUrl } from "@/lib/drive-image-url";

/** URL pública no Storage; senão legado `catalog_image_url`; senão proxy Drive. */
export function productPublicImageUrl(
  p: {
    drive_file_id: string;
    image_url?: string | null;
    catalog_image_url?: string | null;
  },
  /** Só usado no fallback do proxy (`/api/drive-image`). */
  proxyWidth?: number
): string {
  const u = p.image_url?.trim() || p.catalog_image_url?.trim();
  if (u) return u;
  return publicDriveImageUrl(p.drive_file_id, proxyWidth);
}
