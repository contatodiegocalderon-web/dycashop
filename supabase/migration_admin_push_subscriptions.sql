-- Subscriptions Web Push dos admins (notificações com app fechado / tela bloqueada)
create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  staff_email text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_push_subscriptions_email_idx
  on public.admin_push_subscriptions (staff_email);

alter table public.admin_push_subscriptions enable row level security;
