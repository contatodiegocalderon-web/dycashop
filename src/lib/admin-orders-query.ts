import type { createAdminClient } from "@/lib/supabase/admin";
import type { ConfirmedAtFilter } from "@/lib/admin-period";

const PAGE_SIZE = 1000;
const IN_CHUNK = 150;
/** Pedidos por lote ao buscar itens com `.in()` (legado). */
const ORDER_ITEM_IN_CHUNK = 40;
/** Pedidos em paralelo ao buscar itens por `order_id` (métricas 100% completas). */
const ORDER_ITEM_PARALLEL = 12;

type AdminClient = ReturnType<typeof createAdminClient>;

export type PaidOrderRow = {
  id: string;
  display_number?: number | null;
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

export type OrdersIdListQuery = {
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): OrdersIdListQuery;
  range(
    from: number,
    to: number
  ): Promise<{ data: { id: string }[] | null; error: { message: string } | null }>;
};

/** Pagina só `id` (ordem estável por PK — evita buracos com vários `.order()` no PostgREST). */
export async function fetchAllOrderIdsPaginated(
  buildQuery: () => OrdersIdListQuery
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await buildQuery()
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { id: string }[];
    for (const row of chunk) {
      if (row.id) ids.push(row.id);
    }
    if (chunk.length < PAGE_SIZE) break;
    offset += chunk.length;
  }
  return ids;
}

/** Carrega pedidos completos a partir de IDs já filtrados (lotes `.in()`). */
export async function fetchPaidOrdersByIds(
  admin: AdminClient,
  orderIds: string[],
  select: string
): Promise<PaidOrderRow[]> {
  if (!orderIds.length) return [];
  const all: PaidOrderRow[] = [];
  for (let i = 0; i < orderIds.length; i += IN_CHUNK) {
    const chunk = orderIds.slice(i, i + IN_CHUNK);
    const { data, error } = await admin
      .from("orders")
      .select(select)
      .in("id", chunk);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as unknown as PaidOrderRow[]));
  }
  return all;
}

/** Pedido pago com WhatsApp — base para lista/mapa de clientes. */
export type CrmPaidOrderRow = {
  customer_whatsapp: string;
  customer_name: string | null;
  sale_amount: number | null;
  confirmed_at: string | null;
  confirmed_by_staff_id?: string | null;
  requested_seller_name?: string | null;
  legacy_import?: boolean;
};

export type CrmPaidOrdersListQuery = {
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): CrmPaidOrdersListQuery;
  range(
    from: number,
    to: number
  ): Promise<{ data: CrmPaidOrderRow[] | null; error: { message: string } | null }>;
};

/** Pagina todos os pedidos PAGO com WhatsApp (mapa + lista de clientes). */
export async function fetchAllCrmPaidOrders(
  admin: AdminClient,
  buildBaseQuery: () => CrmPaidOrdersListQuery
): Promise<CrmPaidOrderRow[]> {
  const all: CrmPaidOrderRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await buildBaseQuery()
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as CrmPaidOrderRow[];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += chunk.length;
  }
  return all;
}

/** Perfis CRM em lotes (limite do `.in()` no PostgREST). */
export async function fetchCrmProfilesByWhatsapp(
  admin: AdminClient,
  whatsappDigits: string[]
): Promise<Map<string, { business_profile: string | null }>> {
  const map = new Map<string, { business_profile: string | null }>();
  if (!whatsappDigits.length) return map;

  for (let i = 0; i < whatsappDigits.length; i += IN_CHUNK) {
    const chunk = whatsappDigits.slice(i, i + IN_CHUNK);
    const { data, error } = await admin
      .from("crm_client_profiles")
      .select("whatsapp_digits, business_profile")
      .in("whatsapp_digits", chunk);
    if (error) {
      const missing = /does not exist|schema cache|relation/i.test(error.message);
      if (missing) return map;
      throw new Error(error.message);
    }
    for (const raw of data ?? []) {
      const p = raw as { whatsapp_digits: string; business_profile: string | null };
      map.set(p.whatsapp_digits, p);
    }
  }
  return map;
}

/** Colunas usadas em métricas / histórico de vendas reais. */
export const METRICS_ORDER_SELECT =
  "id, display_number, sale_amount, sale_amount_by_category, customer_segment, confirmed_by_staff_id, requested_seller_name, confirmed_at";

/**
 * Pedidos para métricas: 1) pagina IDs por PK, 2) carrega linhas em lotes.
 * Mais confiável que paginar linhas largas com `confirmed_at` + `range`.
 */
export async function fetchAllPaidOrdersWithSale(
  admin: AdminClient,
  buildIdQuery: () => OrdersIdListQuery,
  select: string = METRICS_ORDER_SELECT
): Promise<PaidOrderRow[]> {
  const ids = await fetchAllOrderIdsPaginated(buildIdQuery);
  return fetchPaidOrdersByIds(admin, ids, select);
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

/** Métricas / lucro — só snapshots (sem embed em `products`, que distorce paginação). */
const ORDER_ITEM_METRICS_SELECT =
  "id, order_id, quantity, snapshot_category, snapshot_brand, snapshot_color, snapshot_size";

/** Lista admin de pedidos — inclui URLs para miniaturas. */
const ORDER_ITEM_ADMIN_SELECT =
  "id, order_id, quantity, snapshot_category, snapshot_brand, snapshot_color, snapshot_size, snapshot_image_url, snapshot_drive_file_id";

/** Busca itens de um pedido (sem limite prático de linhas por request). */
async function fetchOrderItemsForSingleOrder(
  admin: AdminClient,
  orderId: string,
  select: string
): Promise<OrderItemMetricsRow[]> {
  const all: OrderItemMetricsRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("order_items")
      .select(select)
      .eq("order_id", orderId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as OrderItemMetricsRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += rows.length;
  }
  return all;
}

/**
 * Carrega todos os itens dos pedidos indicados.
 * Métricas: um pedido de cada vez (evita cortar linhas com `.in()` + milhares de itens).
 * Admin: lotes `.in()` menores com paginação por `rows.length`.
 */
export async function fetchOrderItemsByOrderIds(
  admin: AdminClient,
  orderIds: string[],
  select = ORDER_ITEM_METRICS_SELECT,
  mode: "per_order" | "chunked" = "per_order"
): Promise<Map<string, OrderItemMetricsRow[]>> {
  const map = new Map<string, OrderItemMetricsRow[]>();
  if (!orderIds.length) return map;

  if (mode === "per_order") {
    for (let i = 0; i < orderIds.length; i += ORDER_ITEM_PARALLEL) {
      const batch = orderIds.slice(i, i + ORDER_ITEM_PARALLEL);
      await Promise.all(
        batch.map(async (orderId) => {
          const rows = await fetchOrderItemsForSingleOrder(admin, orderId, select);
          if (rows.length) map.set(orderId, rows);
        })
      );
    }
    return map;
  }

  for (let i = 0; i < orderIds.length; i += ORDER_ITEM_IN_CHUNK) {
    const chunk = orderIds.slice(i, i + ORDER_ITEM_IN_CHUNK);
    let offset = 0;

    for (;;) {
      const { data, error } = await admin
        .from("order_items")
        .select(select)
        .in("order_id", chunk)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as OrderItemMetricsRow[];
      for (const it of rows) {
        const list = map.get(it.order_id) ?? [];
        list.push(it);
        map.set(it.order_id, list);
      }

      if (rows.length < PAGE_SIZE) break;
      offset += rows.length;
    }
  }

  return map;
}

/** Conta itens esperados (valida se a paginação carregou tudo). */
export async function countOrderItemsByOrderIds(
  admin: AdminClient,
  orderIds: string[]
): Promise<number> {
  if (!orderIds.length) return 0;
  let total = 0;
  for (let i = 0; i < orderIds.length; i += IN_CHUNK) {
    const chunk = orderIds.slice(i, i + IN_CHUNK);
    const { count, error } = await admin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("order_id", chunk);
    if (error) throw new Error(error.message);
    total += count ?? 0;
  }
  return total;
}

export type OrdersListRow = Record<string, unknown> & { id: string };

export type OrdersListBuildQuery = {
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): OrdersListBuildQuery;
  range(
    from: number,
    to: number
  ): Promise<{
    data: OrdersListRow[] | null;
    error: { message: string } | null;
  }>;
};

/** Lista pedidos com `order_items` anexados — pedidos e itens paginados. */
export async function fetchOrdersWithItemsPaginated(
  admin: AdminClient,
  buildOrdersQuery: () => OrdersListBuildQuery
): Promise<OrdersListRow[]> {
  const orders: OrdersListRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await buildOrdersQuery()
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as OrdersListRow[];
    orders.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += chunk.length;
  }

  if (!orders.length) return [];

  const orderIds = orders.map((o) => o.id);
  const itemsByOrderId = await fetchOrderItemsByOrderIds(
    admin,
    orderIds,
    ORDER_ITEM_ADMIN_SELECT,
    "chunked"
  );

  return orders.map((o) => ({
    ...o,
    order_items: itemsByOrderId.get(o.id) ?? [],
  }));
}
