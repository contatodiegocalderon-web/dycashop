/**
 * Agrega vendas confirmadas (pedidos PAGO com sale_amount) para métricas e lucro por custo de categoria.
 */

export type CategoryCostMap = Record<string, number>;

export interface OrderSaleRow {
  id: string;
  sale_amount: number | null;
  sale_amount_by_category?:
    | Record<
        string,
        | number
        | {
            unit_price?: number;
            total?: number;
            qty?: number;
          }
      >
    | null;
  customer_segment: string | null;
}

export interface OrderItemSaleRow {
  order_id: string;
  quantity: number;
  snapshot_category: string | null;
  products?:
    | { category: string | null }
    | { category: string | null }[]
    | null;
}

function normalizeKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function productCategoryFromEmbed(
  products: OrderItemSaleRow["products"]
): string | null {
  if (products == null) return null;
  const row = Array.isArray(products) ? products[0] : products;
  return row?.category ?? null;
}

function resolveCategory(it: OrderItemSaleRow): string {
  const snap = it.snapshot_category?.trim();
  if (snap) return snap;
  const p = productCategoryFromEmbed(it.products)?.trim();
  if (p) return p;
  return "Sem categoria";
}

/** Lucro do pedido = valor da venda − Σ (qtd × custo da categoria). */
export function profitForOrder(
  saleAmount: number,
  items: OrderItemSaleRow[],
  costs: CategoryCostMap
): number {
  let totalCost = 0;
  for (const it of items) {
    const cat = resolveCategory(it);
    const unit = costs[cat] ?? costs["Sem categoria"] ?? 0;
    totalCost += it.quantity * unit;
  }
  return saleAmount - totalCost;
}

export interface SalesMetricsResult {
  orderCount: number;
  totalRevenue: number;
  totalProfit: number;
  averageTicket: number;
  /** Categoria com maior número de peças vendidas */
  topCategoryByPieces: string | null;
  piecesByCategory: Record<string, number>;
  revenueByCategory: Record<string, number>;
  profitByCategory: Record<string, number>;
  novoCount: number;
  antigoCount: number;
}

export function aggregateSalesMetrics(
  orders: OrderSaleRow[],
  itemsByOrderId: Map<string, OrderItemSaleRow[]>,
  costs: CategoryCostMap
): SalesMetricsResult {
  const paidWithSale = orders.filter(
    (o) => o.sale_amount != null && Number(o.sale_amount) > 0
  );

  let totalRevenue = 0;
  let totalProfit = 0;
  const piecesByCategory: Record<string, number> = {};
  const revenueByCategory: Record<string, number> = {};
  const profitByCategory: Record<string, number> = {};
  let novoCount = 0;
  let antigoCount = 0;

  const normalizedCosts: Record<string, number> = {};
  for (const [label, c] of Object.entries(costs)) {
    normalizedCosts[normalizeKey(label)] = Number(c || 0);
  }

  for (const o of paidWithSale) {
    const sale = Number(o.sale_amount);
    const items = itemsByOrderId.get(o.id) ?? [];

    if (o.customer_segment === "NOVO") novoCount += 1;
    else if (o.customer_segment === "ANTIGO") antigoCount += 1;

    const totalPieces = items.reduce((s, it) => s + it.quantity, 0) || 1;
    const qtyByCategory: Record<string, number> = {};
    for (const it of items) {
      const cat = resolveCategory(it);
      const catKey = normalizeKey(cat);
      qtyByCategory[catKey] = (qtyByCategory[catKey] ?? 0) + it.quantity;
    }
    const saleByCategory =
      o.sale_amount_by_category && typeof o.sale_amount_by_category === "object"
        ? o.sale_amount_by_category
        : null;
    const hasExplicitCategorySale =
      saleByCategory != null && Object.keys(saleByCategory).length > 0;
    const explicitRevenueByCategory: Record<string, number> = {};
    if (hasExplicitCategorySale) {
      for (const [catLabel, raw] of Object.entries(saleByCategory!)) {
        const key = normalizeKey(catLabel);
        const qty = qtyByCategory[key] ?? 0;
        if (typeof raw === "number") {
          // Legado: número é preço por peça.
          explicitRevenueByCategory[key] = Number((raw * qty).toFixed(2));
          continue;
        }
        if (raw && typeof raw === "object") {
          const r = raw as { total?: unknown; unit_price?: unknown };
          if (typeof r.total === "number") {
            explicitRevenueByCategory[key] = Number(r.total.toFixed(2));
          } else if (typeof r.unit_price === "number") {
            explicitRevenueByCategory[key] = Number((r.unit_price * qty).toFixed(2));
          }
        }
      }
    }
    const explicitOrderRevenue = Object.values(explicitRevenueByCategory).reduce(
      (acc, n) => acc + Number(n || 0),
      0
    );
    const orderRevenue = explicitOrderRevenue > 0 ? explicitOrderRevenue : sale;
    totalRevenue += orderRevenue;
    let orderProfit = 0;

    for (const it of items) {
      const cat = resolveCategory(it);
      const catKey = normalizeKey(cat);
      const qty = it.quantity;
      piecesByCategory[cat] = (piecesByCategory[cat] ?? 0) + qty;

      const categoryRevenue = explicitRevenueByCategory[catKey] ?? 0;
      const allocatedRev =
        categoryRevenue > 0
          ? categoryRevenue * (qtyByCategory[catKey] > 0 ? qty / qtyByCategory[catKey]! : 0)
          : orderRevenue * (qty / totalPieces);
      const unitCost =
        normalizedCosts[catKey] ??
        normalizedCosts[normalizeKey("Sem categoria")] ??
        0;
      const lineCost = qty * unitCost;
      const allocatedProfit = allocatedRev - lineCost;
      orderProfit += allocatedProfit;

      revenueByCategory[cat] = (revenueByCategory[cat] ?? 0) + allocatedRev;
      profitByCategory[cat] = (profitByCategory[cat] ?? 0) + allocatedProfit;
    }
    totalProfit += orderProfit;
  }

  const orderCount = paidWithSale.length;
  let topCategoryByPieces: string | null = null;
  let maxPieces = 0;
  for (const [cat, n] of Object.entries(piecesByCategory)) {
    if (n > maxPieces) {
      maxPieces = n;
      topCategoryByPieces = cat;
    }
  }

  return {
    orderCount,
    totalRevenue,
    totalProfit,
    averageTicket: orderCount > 0 ? totalRevenue / orderCount : 0,
    topCategoryByPieces,
    piecesByCategory,
    revenueByCategory,
    profitByCategory,
    novoCount,
    antigoCount,
  };
}
