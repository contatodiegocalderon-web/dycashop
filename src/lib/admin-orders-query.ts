import type { createAdminClient } from "@/lib/supabase/admin";
import type { ConfirmedAtFilter } from "@/lib/admin-period";

const PAGE_SIZE = 1000;
const IN_CHUNK = 150;

type AdminClient = ReturnType<typeof createAdminClient>;

export type PaidOrderRow = {
  id: string;
  sale_amount: number | null;
  sale_amount_by_category?: unknown;
  customer_segment: string | null;
  confirmed_by_staff_id?: string | null;
  requested_seller_name?: string | null;
  confirmed_at?: string | null;
};

export function applyConfirmedAtFilterToOrdersQuery<
  Q extends {
    gte(column: string, value: string): Q;
    lt(column: string, value: string): Q;
    not(column: string, operator: string, value: unknown): Q;
  },
>(query: Q, filter: ConfirmedAtFilter): Q {
  if (filter.kind === "all") return query;
  let q = query.gte("confirmed_at", filter.startIso).not("confirmed_at", "is", null);
  if (filter.endIso) {
    q = q.lt("confirmed_at", filter.endIso);
  }
  return q;
}

export type OrdersListQuery = {
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): OrdersListQuery;
  range(
    from: number,
    to: number
  ): Promise<{ data: PaidOrderRow[] | null; error: { message: string } | null }>;
};

/** Pagina pedidos PAGO com valor — evita limite ~1000 do PostgREST. */
export async function fetchAllPaidOrdersWithSale(
  admin: AdminClient,
  buildBaseQuery: () => OrdersListQuery
): Promise<PaidOrderRow[]> {
  const all: PaidOrderRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await buildBaseQuery()
      .order("confirmed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as PaidOrderRow[];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export type OrderItemMetricsRow = {
  id?: string;
  order_id: string;
  quantity: number;
  snapshot_category: string | null;
  snapshot_brand: string;
  snapshot_color: string;
  snapshot_size: string;
  products?: { category: string | null } | { category: string | null }[] | null;
};

/** Carrega itens em lotes e páginas (PostgREST limita respostas a ~1000 linhas). */
export async function fetchOrderItemsByOrderIds(
  admin: AdminClient,
  orderIds: string[]
): Promise<Map<string, OrderItemMetricsRow[]>> {
  const map = new Map<string, OrderItemMetricsRow[]>();
  if (!orderIds.length) return map;

  for (let i = 0; i < orderIds.length; i += IN_CHUNK) {
    const chunk = orderIds.slice(i, i + IN_CHUNK);
    let offset = 0;
    for (;;) {
      const { data, error } = await admin
        .from("order_items")
        .select(
          "id, order_id, quantity, snapshot_category, snapshot_brand, snapshot_color, snapshot_size, products(category)"
        )
        .in("order_id", chunk)
        .order("order_id", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as OrderItemMetricsRow[];
      for (const it of rows) {
        const list = map.get(it.order_id) ?? [];
        list.push(it);
        map.set(it.order_id, list);
      }

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return map;
}
