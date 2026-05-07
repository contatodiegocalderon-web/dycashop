import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderItemRow, OrderRow } from "@/types";

/** 18 bytes → 36 caracteres hex */
const TOKEN_RE = /^[a-f0-9]{36}$/;

export function isValidReceiptToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export async function getOrderReceiptByToken(
  token: string
): Promise<{ order: OrderRow; items: OrderItemRow[] } | null> {
  if (!isValidReceiptToken(token)) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select(
      `
      id,
      status,
      customer_note,
      customer_name,
      created_at,
      updated_at,
      order_items (
        id,
        order_id,
        product_id,
        quantity,
        snapshot_image_url,
        snapshot_original_name,
        snapshot_brand,
        snapshot_color,
        snapshot_size,
        snapshot_drive_file_id,
        snapshot_category,
        created_at
      )
    `
    )
    .eq("public_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as OrderRow & {
    order_items?: OrderItemRow[] | null;
  };
  const items = row.order_items ?? [];

  return {
    order: {
      id: row.id,
      status: row.status,
      customer_note: row.customer_note,
      customer_name: row.customer_name ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    items,
  };
}
