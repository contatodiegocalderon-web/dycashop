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

loadEnvLocal();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { error } = await admin
  .from("category_cost_defaults")
  .select("weight_grams_per_piece")
  .limit(1);

if (error?.message?.includes("weight_grams_per_piece")) {
  console.log(
    "Coluna weight_grams_per_piece ausente — execute no Supabase SQL Editor:\n"
  );
  console.log(readFileSync(
    resolve(process.cwd(), "supabase/migration_category_weight_grams.sql"),
    "utf8"
  ));
  process.exit(1);
}

console.log("Coluna weight_grams_per_piece OK.");
