-- REVIVE-AI recovery ops: merchant-scoped audit + policy config
-- Run in the Supabase SQL editor after creating the project.

alter table if exists public.audit_events
  add column if not exists merchant_id uuid references auth.users (id);

create table if not exists public.policy_config (
  merchant_id uuid primary key references auth.users (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;
alter table public.policy_config enable row level security;

drop policy if exists "operators read own audit events" on public.audit_events;
create policy "operators read own audit events"
  on public.audit_events for select
  using (merchant_id = auth.uid());

drop policy if exists "operators insert own audit events" on public.audit_events;
create policy "operators insert own audit events"
  on public.audit_events for insert
  with check (merchant_id = auth.uid());

drop policy if exists "operators update own audit events" on public.audit_events;
create policy "operators update own audit events"
  on public.audit_events for update
  using (merchant_id = auth.uid());

drop policy if exists "operators read own policy" on public.policy_config;
create policy "operators read own policy"
  on public.policy_config for select
  using (merchant_id = auth.uid());

drop policy if exists "operators upsert own policy" on public.policy_config;
create policy "operators upsert own policy"
  on public.policy_config for insert
  with check (merchant_id = auth.uid());

drop policy if exists "operators update own policy" on public.policy_config;
create policy "operators update own policy"
  on public.policy_config for update
  using (merchant_id = auth.uid());
