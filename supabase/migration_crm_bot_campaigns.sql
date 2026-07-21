-- Campanhas do bot de follow-up / reativação (WhatsApp).

create table if not exists public.crm_bot_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by_staff_id uuid references public.staff_users (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'connecting', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  funnel_tab text not null
    check (funnel_tab in ('abandonados', 'em_aberto', 'pos_30', 'pos_30_59', 'pos_60', 'manual')),
  volume_tier text not null default 'all'
    check (volume_tier in ('all', 'atacado', 'varejo', 'manual')),
  profile_filter text not null default 'all'
    check (profile_filter in ('all', 'lojista', 'revendedor', 'uso_proprio', 'sem_perfil')),
  seller_scope text not null default 'all',
  reference_message text not null default '',
  media_base64 text,
  media_mimetype text,
  seconds_per_person integer not null default 10 check (seconds_per_person >= 3),
  group_size integer not null default 10 check (group_size >= 1),
  group_pause_seconds integer not null default 1800 check (group_pause_seconds >= 0),
  variation_count integer not null default 3 check (variation_count >= 1),
  evolution_instance text,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_bot_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.crm_bot_campaigns (id) on delete cascade,
  customer_whatsapp text not null check (length(customer_whatsapp) >= 10),
  customer_name text,
  message_text text not null default '',
  group_index integer not null default 0 check (group_index >= 0),
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists crm_bot_recipients_campaign_scheduled_idx
  on public.crm_bot_recipients (campaign_id, scheduled_at)
  where status = 'pending';

create index if not exists crm_bot_campaigns_status_idx
  on public.crm_bot_campaigns (status)
  where status in ('connecting', 'running');

alter table public.crm_bot_campaigns enable row level security;
alter table public.crm_bot_recipients enable row level security;

drop policy if exists "crm_bot_campaigns_deny_all_anon" on public.crm_bot_campaigns;
create policy "crm_bot_campaigns_deny_all_anon"
  on public.crm_bot_campaigns for all to anon using (false);

drop policy if exists "crm_bot_recipients_deny_all_anon" on public.crm_bot_recipients;
create policy "crm_bot_recipients_deny_all_anon"
  on public.crm_bot_recipients for all to anon using (false);
