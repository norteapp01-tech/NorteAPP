-- Read-only mirror for a future trusted billing integration. No fake records.
-- Authentication remains in auth.users; profiles remain in public.profiles.
begin;
create table public.account_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('web', 'apple', 'google')),
  provider_subscription_id text not null,
  plan text not null check (plan in ('base', 'essential', 'unlimited')),
  status text not null check (status in ('active', 'past_due', 'canceled', 'expired', 'trialing')),
  interval text not null check (interval in ('month', 'year')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(provider, provider_subscription_id)
);
create table public.account_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('web', 'apple', 'google')),
  provider_charge_id text not null,
  created_at timestamptz not null,
  paid_at timestamptz,
  description text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('paid', 'pending', 'failed', 'refunded', 'partially_refunded')),
  receipt_url text check (receipt_url is null or receipt_url like 'https://%'),
  unique(provider, provider_charge_id)
);
create index account_charges_user_date on public.account_charges(user_id, created_at desc);
alter table public.account_subscriptions enable row level security;
alter table public.account_charges enable row level security;
revoke all on public.account_subscriptions, public.account_charges from anon, authenticated;
grant select on public.account_subscriptions, public.account_charges to authenticated;
grant all on public.account_subscriptions, public.account_charges to service_role;
create policy subscription_owner_read on public.account_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy charge_owner_read on public.account_charges for select to authenticated using (user_id = (select auth.uid()));
commit;
