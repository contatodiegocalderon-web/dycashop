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

const { data, error } = await admin
  .from("orders")
  .select("id, sale_amount, order_items(id, quantity)")
  .eq("status", "PAGO")
  .not("sale_amount", "is", null)
  .gt("sale_amount", 0)
  .order("confirmed_at", { ascending: false });

if (error) throw error;

let itemRows = 0;
for (const o of data ?? []) {
  itemRows += (o.order_items ?? []).length;
}

const { count: expectedItems } = await admin
  .from("order_items")
  .select("id", { count: "exact", head: true })
  .in(
    "order_id",
    (data ?? []).map((o) => o.id)
  );

console.log("Pedidos devolvidos (sem paginar):", data?.length ?? 0);
console.log("Itens embutidos na resposta:", itemRows);
console.log("Itens esperados (count in):", expectedItems);
console.log(
  itemRows < (expectedItems ?? 0)
    ? "BUG: /api/admin/orders trunca order_items embutidos"
    : "OK: itens completos na query embutida"
);
