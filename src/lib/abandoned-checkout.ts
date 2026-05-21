import type { CartLine } from "@/types";

export type AbandonedCartItemSnapshot = {
  product_id: string;
  quantity: number;
  brand: string;
  color: string;
  size: string;
  drive_file_id: string;
  image_url: string;
};

export function cartLinesToAbandonedSnapshots(
  lines: CartLine[]
): AbandonedCartItemSnapshot[] {
  return lines.map((l) => ({
    product_id: l.productId,
    quantity: l.quantity,
    brand: l.product.brand,
    color: l.product.color,
    size: l.product.size,
    drive_file_id: l.driveFileId,
    image_url: l.product.drive_image_url,
  }));
}

export function normalizeCheckoutWaDigits(formatted: string): string {
  const raw = formatted.replace(/\D/g, "");
  if (!raw) return "";
  return raw.startsWith("55") ? raw : `55${raw}`;
}
