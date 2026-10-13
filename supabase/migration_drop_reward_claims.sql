-- Jornada de recompensas da comunidade: pedidos de peça grátis, vídeo exclusivo, pulseira e placa.

create table if not exists public.drop_reward_claims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.drop_members (id) on delete cascade,
  kind text not null check (kind in ('free_piece', 'video', 'bracelet', 'plaque')),
  note text,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create index if not exists drop_reward_claims_member_idx
  on public.drop_reward_claims (member_id, created_at desc);
create index if not exists drop_reward_claims_status_idx
  on public.drop_reward_claims (status, created_at desc);

alter table public.drop_reward_claims enable row level security;
