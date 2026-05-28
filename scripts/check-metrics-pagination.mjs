/**
 * Diagnóstico: compara itens carregados vs esperados (métricas).
 * Uso: node scripts/check-metrics-pagination.mjs
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

const PAGE_SIZE = 1000;
const IN_CHUNK = 150;

async function fetchOrders(admin) {
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("orders")
      .select("id")
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
  return all.map((r) => r.id);
}

async function fetchItemsChunked(admin, orderIds) {
  const map = new Map();
  for (let i = 0; i < orderIds.length; i += IN_CHUNK) {
    const chunk = orderIds.slice(i, i + IN_CHUNK);
    let offset = 0;
    for (;;) {
      const { data, error } = await admin
        .from("order_items")
        .select("id, order_id, quantity")
        .in("order_id", chunk)
        .order("order_id", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const it of rows) {
        const list = map.get(it.order_id) ?? [];
        list.push(it);
        map.set(it.order_id, list);
      }
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  let n = 0;
  for (const list of map.values()) n += list.length;
  return n;
}

async function fetchItemsGlobalScan(admin, orderIdSet) {
  const map = new Map();
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("order_items")
      .select("id, order_id, quantity")
      .order("order_id", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const it of rows) {
      if (!orderIdSet.has(it.order_id)) continue;
      const list = map.get(it.order_id) ?? [];
      list.push(it);
      map.set(it.order_id, list);
    }
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  let n = 0;
  for (const list of map.values()) n += list.length;
  return n;
}

async function countExpected(admin, orderIds) {
  let total = 0;
  for (let i = 0; i < orderIds.length; i += IN_CHUNK) {
    const chunk = orderIds.slice(i, i + IN_CHUNK);
    const { count, error } = await admin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("order_id", chunk);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, {
  auth: { persistSession: false },
});

const orderIds = await fetchOrders(admin);
const expected = await countExpected(admin, orderIds);
const chunked = await fetchItemsChunked(admin, orderIds);
const scanned = await fetchItemsGlobalScan(admin, new Set(orderIds));

console.log("Pedidos PAGO com valor:", orderIds.length);
console.log("Itens esperados (count):", expected);
console.log("Itens carregados (chunk+range):", chunked);
console.log("Itens carregados (scan global):", scanned);
console.log(
  chunked < expected
    ? "BUG: chunk+range TRUNCA"
    : "OK: chunk+range completo"
);
console.log(
  scanned < expected
    ? "BUG: scan também trunca"
    : "OK: scan completo"
);
