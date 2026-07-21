/**
 * Compara soma simples de sale_amount vs aggregateSalesMetrics (mesma lógica da API).
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function normalizeKey(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveCategory(it) {
  const snap = it.snapshot_category?.trim();
  if (snap) return snap;
  const p = it.products;
  const row = Array.isArray(p) ? p[0] : p;
  return row?.category?.trim() || "Sem categoria";
}

function aggregate(orders, itemsByOrderId, costs) {
  const normalizedCosts = {};
  for (const [label, c] of Object.entries(costs)) {
    normalizedCosts[normalizeKey(label)] = Number(c || 0);
  }

  let totalRevenue = 0;
  let totalProfit = 0;

  for (const o of orders) {
    const sale = Number(o.sale_amount);
    const items = itemsByOrderId.get(o.id) ?? [];
    const orderPieces = items.reduce((s, it) => s + it.quantity, 0) || 1;
    const qtyByCategory = {};
    for (const it of items) {
      const cat = resolveCategory(it);
      const k = normalizeKey(cat);
      qtyByCategory[k] = (qtyByCategory[k] ?? 0) + it.quantity;
    }
    const saleByCategory = o.sale_amount_by_category;
    const hasExplicit =
      saleByCategory && typeof saleByCategory === "object" &&
      Object.keys(saleByCategory).length > 0;
    const explicitRevenueByCategory = {};
    if (hasExplicit) {
      for (const [catLabel, raw] of Object.entries(saleByCategory)) {
        const key = normalizeKey(catLabel);
        const qty = qtyByCategory[key] ?? 0;
        if (typeof raw === "number") {
          explicitRevenueByCategory[key] = Number((raw * qty).toFixed(2));
        } else if (raw && typeof raw === "object") {
          if (typeof raw.total === "number") {
            explicitRevenueByCategory[key] = Number(raw.total.toFixed(2));
          } else if (typeof raw.unit_price === "number") {
            explicitRevenueByCategory[key] = Number(
              (raw.unit_price * qty).toFixed(2)
            );
          }
        }
      }
    }
    const explicitOrderRevenue = Object.values(explicitRevenueByCategory).reduce(
      (a, n) => a + Number(n || 0),
      0
    );
    const orderRevenue = explicitOrderRevenue > 0 ? explicitOrderRevenue : sale;
    totalRevenue += orderRevenue;

    for (const it of items) {
      const cat = resolveCategory(it);
      const catKey = normalizeKey(cat);
      const qty = it.quantity;
      const categoryRevenue = explicitRevenueByCategory[catKey] ?? 0;
      const allocatedRev =
        categoryRevenue > 0
          ? categoryRevenue *
            (qtyByCategory[catKey] > 0 ? qty / qtyByCategory[catKey] : 0)
          : orderRevenue * (qty / orderPieces);
      const unitCost =
        normalizedCosts[catKey] ??
        normalizedCosts[normalizeKey("Sem categoria")] ??
        0;
      totalProfit += allocatedRev - qty * unitCost;
    }
  }

  return { totalRevenue, totalProfit };
}

const PAGE_SIZE = 1000;
const IN_CHUNK = 150;

loadEnvLocal();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const orders = [];
let offset = 0;
for (;;) {
  const { data, error } = await admin
    .from("orders")
    .select("id, sale_amount, sale_amount_by_category")
    .eq("status", "PAGO")
    .not("sale_amount", "is", null)
    .gt("sale_amount", 0)
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw error;
  const chunk = data ?? [];
  orders.push(...chunk);
  if (chunk.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

const ids = orders.map((o) => o.id);
const itemsByOrderId = new Map();
for (let i = 0; i < ids.length; i += IN_CHUNK) {
  const chunk = ids.slice(i, i + IN_CHUNK);
  let off = 0;
  for (;;) {
    const { data, error } = await admin
      .from("order_items")
      .select(
        "order_id, quantity, snapshot_category, products(category)"
      )
      .in("order_id", chunk)
      .range(off, off + PAGE_SIZE - 1);
    if (error) throw error;
    for (const it of data ?? []) {
      const list = itemsByOrderId.get(it.order_id) ?? [];
      list.push(it);
      itemsByOrderId.set(it.order_id, list);
    }
    if ((data ?? []).length < PAGE_SIZE) break;
    off += PAGE_SIZE;
  }
}

const { data: costRows } = await admin
  .from("category_cost_defaults")
  .select("category_label, cost_per_piece");
const costs = {};
for (const r of costRows ?? []) costs[r.category_label] = Number(r.cost_per_piece);

const simpleSum = orders.reduce((s, o) => s + Number(o.sale_amount), 0);
const agg = aggregate(orders, itemsByOrderId, costs);

console.log("Pedidos:", orders.length);
console.log("Soma sale_amount:", simpleSum.toFixed(2));
console.log("Faturamento (métricas):", agg.totalRevenue.toFixed(2));
console.log("Lucro (métricas):", agg.totalProfit.toFixed(2));
console.log("Diferença faturamento:", (agg.totalRevenue - simpleSum).toFixed(2));
