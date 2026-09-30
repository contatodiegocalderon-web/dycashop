-- Impressão digital do ficheiro no Drive. O modifiedTime muda ao renomear
-- (stock no nome); o md5 só muda quando os bytes da foto mudam.
alter table public.products add column if not exists drive_md5 text;
