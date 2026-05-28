-- Última importação/sincronização Drive → catálogo (distinto de updated_at da config OAuth/pasta)
alter table public.catalog_settings
  add column if not exists catalog_synced_at timestamptz;
