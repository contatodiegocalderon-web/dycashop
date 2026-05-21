import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderStockConflictItem = {
  product_id: string | null;
  brand: string;
  color: string;
  size: string;
  quantity: number;
  available: number;
};

export type OrderStockConflict = {
  flagged_at: string;
  triggered_by_order_id: string;
  triggered_by_display_number?: number | null;
  items: OrderStockConflictItem[];
};

export const STOCK_CONFLICT_CLIENT_MESSAGE =
  "Uma ou mais peças deste pedido já esgotaram (outro cliente confirmou antes). Por favor, refaça o pedido no catálogo.";

export const STOCK_CONFLICT_ADMIN_MESSAGE =
  "Conflito de stock: o cliente precisa refazer o pedido — alguma peça já foi vendida noutro pedido confirmado.";

export function parseOrderStockConflict(raw: unknown): OrderStockConflict | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const itemsRaw = o.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;
  const items: OrderStockConflictItem[] = [];
  for (const row of itemsRaw) {
    if (row == null || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const brand = String(r.brand ?? "").trim();
    const color = String(r.color ?? "").trim();
    const size = String(r.size ?? "").trim();
    const quantity = Number(r.quantity);
    if (!brand || !color || !size || !Number.isFinite(quantity) || quantity < 1) {
      continue;
    }
    items.push({
      product_id:
        typeof r.product_id === "string" && r.product_id.trim()
          ? r.product_id.trim()
          : null,
      brand,
      color,
      size,
      quantity,
      available: Math.max(0, Number(r.available) || 0),
    });
  }
  if (items.length === 0) return null;
  return {
    flagged_at: String(o.flagged_at ?? new Date().toISOString()),
    triggered_by_order_id: String(o.triggered_by_order_id ?? ""),
    triggered_by_display_number:
      typeof o.triggered_by_display_number === "number"
        ? o.triggered_by_display_number
        : null,
    items,
  };
}

type PendingItemRow = {
  order_id: string;
  product_id: string | null;
  quantity: number;
  snapshot_brand: string;
  snapshot_color: string;
  snapshot_size: string;
};

/**
 * Após confirmar um pedido, marca outros pendentes que já não têm stock para as peças afetadas.
 * Não reserva stock em pendentes — só avisa depois da disputa.
 */
export async function flagPendingOrdersAfterConfirm(
  admin: SupabaseClient,
  opts: {
    confirmedOrderId: string;
    confirmedDisplayNumber?: number | null;
    /** Stock na BD já actualizado (pós-confirmação). */
    stockAfterByProductId: Map<string, number>;
  }
): Promise<number> {
  const productIds = Array.from(opts.stockAfterByProductId.keys()).filter(Boolean);
  if (productIds.length === 0) return 0;

  const { data: pendingItems, error: piErr } = await admin
    .from("order_items")
    .select(
      "order_id, product_id, quantity, snapshot_brand, snapshot_color, snapshot_size, orders!inner(id, status)"
    )
    .in("product_id", productIds)
    .eq("orders.status", "PENDENTE_PAGAMENTO")
    .neq("order_id", opts.confirmedOrderId);

  if (piErr) throw new Error(piErr.message);
  if (!pendingItems?.length) return 0;

  const qtyNeededByOrderProduct = new Map<string, number>();
  const metaByOrderProduct = new Map<string, PendingItemRow>();

  for (const raw of pendingItems) {
    const row = raw as PendingItemRow;
    const pid = row.product_id;
    if (!pid) continue;
    const key = `${row.order_id}:${pid}`;
    qtyNeededByOrderProduct.set(
      key,
      (qtyNeededByOrderProduct.get(key) ?? 0) + row.quantity
    );
    if (!metaByOrderProduct.has(key)) {
      metaByOrderProduct.set(key, row);
    }
  }

  const conflictByOrderId = new Map<string, OrderStockConflictItem[]>();

  for (const [key, needed] of Array.from(qtyNeededByOrderProduct.entries())) {
    const [orderId, productId] = key.split(":");
    const available = opts.stockAfterByProductId.get(productId) ?? 0;
    if (needed <= available) continue;
    const meta = metaByOrderProduct.get(key);
    if (!meta) continue;
    const list = conflictByOrderId.get(orderId) ?? [];
    list.push({
      product_id: productId,
      brand: meta.snapshot_brand,
      color: meta.snapshot_color,
      size: meta.snapshot_size,
      quantity: needed,
      available,
    });
    conflictByOrderId.set(orderId, list);
  }

  let flagged = 0;
  const flaggedAt = new Date().toISOString();

  for (const [orderId, items] of Array.from(conflictByOrderId.entries())) {
    const payload: OrderStockConflict = {
      flagged_at: flaggedAt,
      triggered_by_order_id: opts.confirmedOrderId,
      triggered_by_display_number: opts.confirmedDisplayNumber ?? null,
      items,
    };
    const { error: uErr } = await admin
      .from("orders")
      .update({ stock_conflict: payload })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO");
    if (!uErr) flagged += 1;
  }

  return flagged;
}
