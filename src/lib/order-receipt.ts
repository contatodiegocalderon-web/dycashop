import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderStockConflict } from "@/lib/order-stock-conflict";
import type { OrderItemRow, OrderRow } from "@/types";

/** 18 bytes → 36 caracteres hex */
const TOKEN_RE = /^[a-f0-9]{36}$/;

export function isValidReceiptToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export async function isCancelledReceiptToken(token: string): Promise<boolean> {
  if (!isValidReceiptToken(token)) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cancelled_receipt_tokens")
    .select("public_token")
    .eq("public_token", token)
    .maybeSingle();
  if (error) {
    if (/cancelled_receipt_tokens|relation|schema/i.test(error.message)) {
      return false;
    }
    return false;
  }
  return !!data?.public_token;
}

/** Regista token antes de apagar o pedido (link /recibo mostra mensagem de cancelado). */
export async function recordCancelledReceiptToken(
  token: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = String(token ?? "").trim();
  if (!isValidReceiptToken(t)) return { ok: true };
  const admin = createAdminClient();
  const { error } = await admin
    .from("cancelled_receipt_tokens")
    .upsert({ public_token: t }, { onConflict: "public_token" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
      display_number,
      status,
      customer_note,
      customer_name,
      stock_conflict,
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
      display_number:
        typeof row.display_number === "number" &&
        Number.isFinite(row.display_number) &&
        row.display_number > 0
          ? row.display_number
          : undefined,
      status: row.status,
      customer_note: row.customer_note,
      customer_name: row.customer_name ?? null,
      stock_conflict: parseOrderStockConflict(
        (row as { stock_conflict?: unknown }).stock_conflict
      ),
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    items,
  };
}
