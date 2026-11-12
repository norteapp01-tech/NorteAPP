-- Concurrent dispatch leases and per-device receipts. No access from the app.
begin;
alter table public.reminders
 add column if not exists dispatch_token uuid,
 add column if not exists dispatch_claim_until timestamptz,
 add column if not exists dispatch_retry_at timestamptz;
create table public.push_delivery_receipts (
 reminder_id uuid not null references public.reminders(id) on delete cascade,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 delivered_at timestamptz not null default now(),
 primary key(reminder_id,subscription_id)
);
alter table public.push_delivery_receipts enable row level security;
revoke all on public.push_delivery_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.push_delivery_receipts to service_role;
create index reminders_dispatch_pending on public.reminders(remind_at,dispatch_retry_at)
 where notified_at is null and not done;
commit;
