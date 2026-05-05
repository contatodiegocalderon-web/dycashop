/** Mensagem útil quando createClient falha ou o PostgREST devolve erro. */
export function supabaseFailureHint(raw: string): string {
  const m = raw.toLowerCase();
  if (
    m.includes("fetch failed") ||
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("certificate") ||
    m.includes("typeerror")
  ) {
    return `${raw.trim()} — Verifique no .env.local: NEXT_PUBLIC_SUPABASE_URL deve ser o URL real do projeto (Supabase → Project Settings → API, ex.: https://abcdefgh.supabase.co), não um placeholder. Confirme também SUPABASE_SERVICE_ROLE_KEY (service_role, começa por eyJ… longo).`;
  }
  if (
    m.includes("does not exist") ||
    m.includes("catalog_settings") ||
    m.includes("relation") ||
    m.includes("42p01")
  ) {
    return `${raw.trim()} — No Supabase → SQL Editor, execute o script da tabela catalog_settings (ficheiro supabase/catalog_settings.sql neste projeto).`;
  }
  return raw;
}
