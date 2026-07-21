-- Tokens de recibos cancelados (pedido apagado; mensagem amigável em /recibo/[token]).
create table if not exists public.cancelled_receipt_tokens (
  public_token text primary key,
  cancelled_at timestamptz not null default now()
);

insert into public.cancelled_receipt_tokens (public_token)
select public_token
from public.orders
where status = 'CANCELADO'
  and public_token is not null
on conflict (public_token) do nothing;

delete from public.orders
where status = 'CANCELADO';

alter table public.cancelled_receipt_tokens enable row level security;

drop policy if exists "cancelled_receipt_tokens_deny_all_anon" on public.cancelled_receipt_tokens;
create policy "cancelled_receipt_tokens_deny_all_anon"
  on public.cancelled_receipt_tokens for all
  to anon
  using (false);
