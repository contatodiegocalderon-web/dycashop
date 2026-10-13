-- Cronograma automático da comunidade: checks por dia/slot e material de cada formato.

create table if not exists public.drop_plan_checks (
  member_id uuid not null references public.drop_members (id) on delete cascade,
  day date not null,
  slot text not null,
  checked_at timestamptz not null default now(),
  primary key (member_id, day, slot)
);

create index if not exists drop_plan_checks_member_day_idx
  on public.drop_plan_checks (member_id, day desc);

create table if not exists public.drop_content_formats (
  format_key text primary key,
  material_url text,
  lesson_id uuid references public.drop_lessons (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.drop_plan_checks enable row level security;
alter table public.drop_content_formats enable row level security;
