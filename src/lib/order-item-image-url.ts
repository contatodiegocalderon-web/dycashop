import { publicDriveImageUrl } from "@/lib/drive-image-url";
import type { OrderItemRow } from "@/types";

const GOOGLE_DRIVE_HOST_RE =
  /(^|\.)((drive|docs)\.google\.com|googleusercontent\.com)$/i;

function isGoogleDriveHttpUrl(url: string): boolean {
  try {
    return GOOGLE_DRIVE_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** URL de miniatura para itens de pedido (admin, recibo, etc.). */
export function orderItemImageUrl(
  it: Pick<OrderItemRow, "snapshot_image_url" | "snapshot_drive_file_id">,
  width = 380
): string | null {
  const fid = it.snapshot_drive_file_id?.trim();
  const snap = it.snapshot_image_url?.trim() ?? "";

  if (snap.startsWith("/api/drive-image/")) return snap;

  if (snap.startsWith("http://") || snap.startsWith("https://")) {
    if (!isGoogleDriveHttpUrl(snap)) return snap;
    if (fid) return publicDriveImageUrl(fid, width);
    return null;
  }

  if (fid) return publicDriveImageUrl(fid, width);
  return null;
}
