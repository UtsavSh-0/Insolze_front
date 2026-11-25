create table if not exists public.waitlist (
  email text primary key check (char_length(email) between 3 and 254),
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;
revoke all on table public.waitlist from anon, authenticated;
grant all on table public.waitlist to service_role;
