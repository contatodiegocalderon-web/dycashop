/**
 * Diagnóstico: fetch de pedidos para métricas vs count.
 * Uso: node scripts/diagnose-metrics-fetch.mjs
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
const COLS =
  "id, sale_amount, sale_amount_by_category, customer_segment, confirmed_by_staff_id, requested_seller_name, confirmed_at";

function base(admin) {
  return admin
    .from("orders")
    .select(COLS)
    .eq("status", "PAGO")
    .not("sale_amount", "is", null)
    .gt("sale_amount", 0)
    .not("confirmed_at", "is", null)
    .eq("legacy_import", false);
}

async function fetchDesc(admin) {
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await base(admin)
      .order("confirmed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += chunk.length;
  }
  return all;
}

async function fetchIdAsc(admin) {
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await base(admin)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += chunk.length;
  }
  return all;
}

async function fetchIdsOnly(admin) {
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("orders")
      .select("id, display_number")
      .eq("status", "PAGO")
      .not("sale_amount", "is", null)
      .gt("sale_amount", 0)
      .not("confirmed_at", "is", null)
      .eq("legacy_import", false)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += chunk.length;
  }
  return all;
}

loadEnvLocal();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { count, error: cErr } = await admin
  .from("orders")
  .select("id", { count: "exact", head: true })
  .eq("status", "PAGO")
  .not("sale_amount", "is", null)
  .gt("sale_amount", 0)
  .not("confirmed_at", "is", null)
  .eq("legacy_import", false);
if (cErr) throw cErr;

const desc = await fetchDesc(admin);
const asc = await fetchIdAsc(admin);
const idsOnly = await fetchIdsOnly(admin);

const descIds = new Set(desc.map((r) => r.id));
const missing = idsOnly.filter((r) => !descIds.has(r.id));

console.log("count (head):", count);
console.log("fetch desc (métricas atual):", desc.length);
console.log("fetch id asc:", asc.length);
console.log("fetch ids only:", idsOnly.length);
console.log(
  "Faltando no fetch desc:",
  missing.map((r) => `#${r.display_number}`).join(", ") || "(nenhum)"
);

if (missing.length) {
  const { data: rows } = await admin
    .from("orders")
    .select("id, display_number, confirmed_at, sale_amount_by_category")
    .in(
      "id",
      missing.map((r) => r.id)
    );
  for (const r of rows ?? []) {
    console.log(" ", r.display_number, r.confirmed_at, typeof r.sale_amount_by_category);
  }
}

// Simula castOrdersQueryAfterFilters (como na API de métricas)
function realAppOnOps(q) {
  return q
    .eq("status", "PAGO")
    .not("sale_amount", "is", null)
    .gt("sale_amount", 0)
    .not("confirmed_at", "is", null)
    .eq("legacy_import", false);
}
function castBack(orig, filtered) {
  return filtered;
}
async function fetchViaCast(admin) {
  const all = [];
  let offset = 0;
  for (;;) {
    const raw = admin.from("orders").select(COLS);
    const filtered = realAppOnOps(raw);
    const q = castBack(raw, filtered);
    const { data, error } = await q
      .order("confirmed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += chunk.length;
  }
  return all;
}
const viaCast = await fetchViaCast(admin);
console.log("fetch via cast (API pattern):", viaCast.length);
const castIds = new Set(viaCast.map((r) => r.id));
const missCast = idsOnly.filter((r) => !castIds.has(r.id));
console.log(
  "Faltando via cast:",
  missCast.map((r) => `#${r.display_number}`).join(", ") || "(nenhum)"
);
