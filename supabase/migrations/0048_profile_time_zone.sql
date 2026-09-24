-- IANA time zone chosen by the user; null means follow the device's local time.
alter table public.profiles add column if not exists time_zone text;
