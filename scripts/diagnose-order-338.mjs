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

const { data: byNum } = await admin
  .from("orders")
  .select("*")
  .eq("display_number", 338)
  .maybeSingle();

console.log("=== Pedido #338 ===");
if (!byNum) {
  console.log("Não encontrado por display_number");
} else {
  const o = byNum;
  console.log({
    id: o.id,
    status: o.status,
    sale_amount: o.sale_amount,
    confirmed_at: o.confirmed_at,
    confirmed_by_staff_id: o.confirmed_by_staff_id,
    customer_segment: o.customer_segment,
    sale_amount_by_category: o.sale_amount_by_category,
  });
  const passesMetrics =
    o.status === "PAGO" &&
    o.sale_amount != null &&
    Number(o.sale_amount) > 0 &&
    o.confirmed_at != null;
  console.log("Passa filtro métricas (PAGO, sale>0, confirmed_at)?", passesMetrics);
}

const { count: metricsCount } = await admin
  .from("orders")
  .select("id", { count: "exact", head: true })
  .eq("status", "PAGO")
  .not("sale_amount", "is", null)
  .gt("sale_amount", 0)
  .not("confirmed_at", "is", null);

console.log("\nTotal pedidos no filtro métricas:", metricsCount);

const { data: newest } = await admin
  .from("orders")
  .select("display_number, status, sale_amount, confirmed_at, confirmed_by_staff_id")
  .eq("status", "PAGO")
  .order("confirmed_at", { ascending: false })
  .limit(3);

console.log("\n3 pedidos PAGO mais recentes:");
for (const o of newest ?? []) {
  console.log(o);
}
