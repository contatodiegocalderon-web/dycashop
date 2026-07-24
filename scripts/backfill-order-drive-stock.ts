/**
 * Alinha nomes no Drive ao stock atual dos produtos de um pedido (já pago).
 * Uso: npx --yes tsx scripts/backfill-order-drive-stock.ts 5247
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { renameDriveFilesToCurrentStock } from "../src/services/drive-rename-stock";

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

async function main() {
  loadEnvLocal();

  const displayNumber = Number(process.argv[2] || "5247");
  if (!Number.isFinite(displayNumber) || displayNumber <= 0) {
    console.error(
      "Uso: npx tsx scripts/backfill-order-drive-stock.ts <display_number>"
    );
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, display_number, status")
    .eq("display_number", displayNumber)
    .maybeSingle();

  if (oErr || !order) {
    console.error("Pedido não encontrado:", oErr?.message ?? displayNumber);
    process.exit(1);
  }

  const { data: items, error: iErr } = await admin
    .from("order_items")
    .select("product_id")
    .eq("order_id", order.id);

  if (iErr) {
    console.error(iErr.message);
    process.exit(1);
  }

  const productIds = Array.from(
    new Set(
      (items ?? [])
        .map((it) =>
          String((it as { product_id?: string }).product_id ?? "").trim()
        )
        .filter(Boolean)
    )
  );

  console.log(
    `Pedido #${order.display_number} (${order.status}) — ${productIds.length} produtos`
  );

  const { data: before } = await admin
    .from("products")
    .select("id, brand, color, stock, original_file_name")
    .in("id", productIds);
  console.log("antes:", before);

  const rename = await renameDriveFilesToCurrentStock(productIds);
  console.log("resultado:", rename);

  const { data: after } = await admin
    .from("products")
    .select("id, brand, color, stock, original_file_name")
    .in("id", productIds);
  console.log("depois:", after);

  process.exit(rename.errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
