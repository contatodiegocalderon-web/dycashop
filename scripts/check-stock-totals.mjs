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

loadEnvLocal();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const PAGE = 1000;
const all = [];
let offset = 0;
for (;;) {
  const { data, error } = await admin
    .from("products")
    .select("category, stock, status, created_at, updated_at")
    .range(offset, offset + PAGE - 1);
  if (error) throw error;
  all.push(...(data ?? []));
  if ((data ?? []).length < PAGE) break;
  offset += PAGE;
}

const { data: settings } = await admin
  .from("catalog_settings")
  .select("catalog_synced_at, updated_at")
  .eq("id", 1)
  .maybeSingle();

const pieces = all.reduce((s, p) => s + Math.max(0, Number(p.stock) || 0), 0);
const byCat = new Map();
for (const p of all) {
  const c = String(p.category ?? "Sem categoria").trim() || "Sem categoria";
  const cur = byCat.get(c) ?? { skus: 0, pieces: 0 };
  cur.skus += 1;
  cur.pieces += Math.max(0, Number(p.stock) || 0);
  byCat.set(c, cur);
}

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);
const createdToday = all.filter((p) => new Date(p.created_at) >= todayStart).length;
const updatedToday = all.filter((p) => new Date(p.updated_at) >= todayStart).length;

console.log("=== ESTOQUE BD ===");
console.log("catalog_synced_at:", settings?.catalog_synced_at ?? "—");
console.log("settings updated_at:", settings?.updated_at ?? "—");
console.log("produtos (rows):", all.length, "| soma stock:", pieces);
console.log("criados hoje:", createdToday, "| updated hoje:", updatedToday);

console.log("\n--- categorias CAMISETA ---");
for (const [k, v] of [...byCat.entries()]
  .filter(([k]) => k.toUpperCase().includes("CAMISETA"))
  .sort((a, b) => b[1].pieces - a[1].pieces)) {
  console.log(`${k}: ${v.skus} SKUs, ${v.pieces} pecas`);
}

console.log("\n--- top 10 categorias ---");
for (const [k, v] of [...byCat.entries()]
  .sort((a, b) => b[1].pieces - a[1].pieces)
  .slice(0, 10)) {
  console.log(`${k}: ${v.skus} SKUs, ${v.pieces} pecas`);
}

const yesterdayStart = new Date(todayStart);
yesterdayStart.setDate(yesterdayStart.getDate() - 1);

function inDay(iso, dayStart) {
  const d = new Date(iso);
  const next = new Date(dayStart);
  next.setDate(next.getDate() + 1);
  return d >= dayStart && d < next;
}

const cam = all.filter((p) =>
  String(p.category ?? "").includes("CAMISETAS STREETWEAR")
);
const todayCam = cam.filter((p) => inDay(p.created_at, todayStart));
const yestCam = cam.filter((p) => inDay(p.created_at, yesterdayStart));

console.log("\n=== CAMISETAS STREETWEAR ===");
console.log(
  "Total:",
  cam.length,
  "SKUs,",
  cam.reduce((s, p) => s + Number(p.stock || 0), 0),
  "pecas"
);
console.log(
  "Criados ontem:",
  yestCam.length,
  "SKUs,",
  yestCam.reduce((s, p) => s + Number(p.stock || 0), 0),
  "pecas"
);
console.log(
  "Criados hoje:",
  todayCam.length,
  "SKUs,",
  todayCam.reduce((s, p) => s + Number(p.stock || 0), 0),
  "pecas"
);

const { data: settingsFull } = await admin
  .from("catalog_settings")
  .select("*")
  .eq("id", 1)
  .maybeSingle();
console.log("\n=== catalog_settings ===");
console.log(settingsFull ? JSON.stringify(settingsFull, null, 2) : "sem linha");
