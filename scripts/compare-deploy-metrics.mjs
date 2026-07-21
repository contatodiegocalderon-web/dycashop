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

const { data: orders } = await admin
  .from("orders")
  .select(
    "id, display_number, sale_amount, confirmed_at, confirmed_by_staff_id, sale_amount_by_category"
  )
  .eq("status", "PAGO")
  .not("sale_amount", "is", null)
  .gt("sale_amount", 0)
  .order("confirmed_at", { ascending: false });

console.log("Projeto:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("Pedidos (filtro métricas):", orders?.length ?? 0);

let sumSale = 0;
for (const o of orders ?? []) sumSale += Number(o.sale_amount);

console.log("Soma sale_amount:", sumSale.toFixed(2));
console.log("\nÚltimos 5 pedidos:");
for (const o of (orders ?? []).slice(0, 5)) {
  console.log(
    `#${o.display_number ?? "?"} | sale=${o.sale_amount} | ${o.confirmed_at?.slice(0, 10)}`
  );
}

// Pedido mais recente (candidato a estar só num ambiente)
const newest = orders?.[0];
if (newest) {
  console.log("\nPedido mais recente (se deploy=131, pode ser este a mais no local):");
  console.log(JSON.stringify(newest, null, 2));
}
