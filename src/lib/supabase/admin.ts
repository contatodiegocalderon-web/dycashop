import { createClient } from "@supabase/supabase-js";

/** Cliente com service role — apenas em Route Handlers / Server Actions (nunca no browser). */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente no .env.local. Dashboard → Settings → API Keys → «Legacy anon, service_role» → service_role. Link: https://supabase.com/dashboard/project/wvrkfbcyszrttbqewypc/settings/api-keys"
    );
  }
  if (url.includes("xxxx") || !url.startsWith("https://")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL parece placeholder ou inválido. Use o URL em Supabase → Project Settings → API (https://…supabase.co)."
    );
  }
  const looksLegacyJwt =
    key.startsWith("eyJ") && key.length >= 80;
  const looksNewSecret =
    key.startsWith("sb_secret_") && key.length >= 24;
  if (key === "eyJ..." || (!looksLegacyJwt && !looksNewSecret)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY inválida ou placeholder. Painel: Settings → API Keys → separador «Legacy anon, service_role» → copiar service_role (eyJ…). Ou uma Secret key (sb_secret_…) em API Keys."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
