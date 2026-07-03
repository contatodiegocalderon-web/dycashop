import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
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

async function fetchPaginated(admin, orderCols) {
  const PAGE = 1000;
  const all = [];
  let offset = 0;
  for (;;) {
    let q = admin.from("products").select("id, category, stock");
    for (const [col, asc] of orderCols) {
      q = q.order(col, { ascending: asc });
    }
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

loadEnvLocal();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const buggy = await fetchPaginated(admin, [
  ["category", true],
  ["size", true],
]);
const fixed = await fetchPaginated(admin, [
  ["category", true],
  ["size", true],
  ["id", true],
]);

function sum(rows) {
  return rows.reduce((s, p) => s + Math.max(0, Number(p.stock) || 0), 0);
}

const buggyIds = new Set(buggy.map((p) => p.id));
const fixedIds = new Set(fixed.map((p) => p.id));

console.log("Paginacao API actual (category, size):");
console.log("  rows:", buggy.length, "| ids unicos:", buggyIds.size, "| pecas:", sum(buggy));
console.log("Paginacao com id (corrigida):");
console.log("  rows:", fixed.length, "| ids unicos:", fixedIds.size, "| pecas:", sum(fixed));
console.log("  faltando na API actual:", fixed.length - buggyIds.size);
