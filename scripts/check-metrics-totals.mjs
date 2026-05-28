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

const PAGE_SIZE = 1000;
const IN_CHUNK = 150;

loadEnvLocal();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function fetchAllPaid() {
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("orders")
      .select("id, sale_amount, sale_amount_by_category, customer_segment")
      .eq("status", "PAGO")
      .not("sale_amount", "is", null)
      .gt("sale_amount", 0)
      .order("confirmed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function fetchItems(orderIds) {
  const map = new Map();
  for (let i = 0; i < orderIds.length; i += IN_CHUNK) {
    const chunk = orderIds.slice(i, i + IN_CHUNK);
    let offset = 0;
    for (;;) {
      const { data, error } = await admin
        .from("order_items")
        .select(
          "order_id, quantity, snapshot_category, products(category)"
        )
        .in("order_id", chunk)
        .order("order_id", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      for (const it of data ?? []) {
        const list = map.get(it.order_id) ?? [];
        list.push(it);
        map.set(it.order_id, list);
      }
      if ((data ?? []).length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return map;
}

const orders = await fetchAllPaid();
const ids = orders.map((o) => o.id);
const items = await fetchItems(ids);

const sumSaleAmount = orders.reduce((s, o) => s + Number(o.sale_amount), 0);
let ordersWithZeroItems = 0;
let ordersWithItems = 0;
for (const o of orders) {
  const list = items.get(o.id) ?? [];
  if (list.length === 0) ordersWithZeroItems++;
  else ordersWithItems++;
}

const { data: costs } = await admin
  .from("category_cost_defaults")
  .select("category_label, cost_per_piece");

console.log("Pedidos:", orders.length);
console.log("Soma sale_amount (simples):", sumSaleAmount.toFixed(2));
console.log("Pedidos sem itens carregados:", ordersWithZeroItems);
console.log("Pedidos com itens:", ordersWithItems);
console.log("Custos categorias:", (costs ?? []).length);
