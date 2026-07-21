-- Guarda qual GOOGLE_CLIENT_ID emitiu o refresh token (detecta mismatch após trocar credenciais).
alter table public.catalog_settings
  add column if not exists google_oauth_client_id text;
