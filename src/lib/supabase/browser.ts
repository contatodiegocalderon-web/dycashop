import { createClient } from "@supabase/supabase-js";

/** Cliente anônimo — apenas leitura de produtos permitida pelo RLS. */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausente");
  }
  return createClient(url, key);
}
