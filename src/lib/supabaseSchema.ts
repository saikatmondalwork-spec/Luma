export const SUPABASE_SCHEMA_SQL = `-- Luma Supabase Schema & Row-Level Security Policies
-- Run once in Supabase SQL Editor: https://supabase.com/dashboard/project/hrallhfsbatwxiqbvfeo/sql/new

create table if not exists public.luma_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  last_login_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.luma_user_settings (
  user_id uuid primary key references public.luma_users(id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.luma_cycles (
  user_id uuid not null references public.luma_users(id) on delete cascade,
  id text not null,
  start_date text not null,
  end_date text,
  notes text not null default '',
  created_at text not null,
  updated_at text not null,
  primary key (user_id, id)
);

create index if not exists idx_luma_cycles_user_start
  on public.luma_cycles (user_id, start_date);

create table if not exists public.luma_daily_logs (
  user_id uuid not null references public.luma_users(id) on delete cascade,
  id text not null,
  date text not null,
  bleeding_flow text,
  symptoms jsonb not null default '[]'::jsonb,
  mood text,
  energy_level text,
  sleep jsonb,
  notes text not null default '',
  created_at text not null,
  updated_at text not null,
  primary key (user_id, id),
  unique (user_id, date)
);

create index if not exists idx_luma_daily_logs_user_date
  on public.luma_daily_logs (user_id, date desc);

alter table public.luma_users enable row level security;
alter table public.luma_user_settings enable row level security;
alter table public.luma_cycles enable row level security;
alter table public.luma_daily_logs enable row level security;

drop policy if exists "Users can view own profile" on public.luma_users;
create policy "Users can view own profile"
  on public.luma_users for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.luma_users;
create policy "Users can insert own profile"
  on public.luma_users for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.luma_users;
create policy "Users can update own profile"
  on public.luma_users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users manage own settings" on public.luma_user_settings;
create policy "Users manage own settings"
  on public.luma_user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own cycles" on public.luma_cycles;
create policy "Users manage own cycles"
  on public.luma_cycles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own daily logs" on public.luma_daily_logs;
create policy "Users manage own daily logs"
  on public.luma_daily_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.handle_new_luma_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.luma_users (id, email, last_login_at, created_at, updated_at)
  values (new.id, coalesce(new.email, ''), now(), now(), now())
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_luma on auth.users;
create trigger on_auth_user_created_luma
  after insert on auth.users
  for each row execute procedure public.handle_new_luma_user();
`;
