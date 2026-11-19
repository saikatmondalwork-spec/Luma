export const SUPABASE_SCHEMA_SQL = `-- Luma Supabase Schema, Idempotent Sync Integrity Migration & Row-Level Security Policies
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
  sync_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.luma_user_settings
  add column if not exists sync_revision bigint not null default 0;

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

create or replace function public.luma_sync_user_data(
  p_email text,
  p_expected_revision bigint,
  p_settings jsonb,
  p_settings_updated_at timestamptz,
  p_cycles jsonb default '[]'::jsonb,
  p_daily_logs jsonb default '[]'::jsonb,
  p_deleted_cycle_ids text[] default '{}'::text[],
  p_deleted_log_ids text[] default '{}'::text[],
  p_deleted_log_dates text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_revision bigint;
  v_current_settings jsonb;
  v_current_settings_updated_at timestamptz;
  v_new_revision bigint;
  v_cycle jsonb;
  v_log jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.luma_users (id, email, last_login_at, updated_at)
  values (v_user_id, coalesce(p_email, ''), now(), now())
  on conflict (id) do update
    set email = coalesce(nullif(excluded.email, ''), public.luma_users.email),
        last_login_at = now(),
        updated_at = now();

  select sync_revision, settings, updated_at
    into v_current_revision, v_current_settings, v_current_settings_updated_at
    from public.luma_user_settings
   where user_id = v_user_id
   for update;

  if found then
    if p_expected_revision is not null and v_current_revision <> p_expected_revision then
      return jsonb_build_object(
        'status', 'conflict',
        'server_revision', v_current_revision
      );
    end if;

    v_new_revision := v_current_revision + 1;

    update public.luma_user_settings
       set settings = case
             when p_settings_updated_at >= v_current_settings_updated_at then p_settings
             else v_current_settings
           end,
           updated_at = greatest(p_settings_updated_at, v_current_settings_updated_at),
           sync_revision = v_new_revision
     where user_id = v_user_id;
  else
    if p_expected_revision is not null and p_expected_revision > 0 then
      return jsonb_build_object(
        'status', 'conflict',
        'server_revision', 0
      );
    end if;

    v_new_revision := 1;
    insert into public.luma_user_settings (user_id, settings, sync_revision, updated_at)
    values (v_user_id, p_settings, v_new_revision, coalesce(p_settings_updated_at, now()));
  end if;

  if array_length(p_deleted_cycle_ids, 1) is not null then
    delete from public.luma_cycles
     where user_id = v_user_id
       and id = any(p_deleted_cycle_ids);
  end if;

  if array_length(p_deleted_log_ids, 1) is not null then
    delete from public.luma_daily_logs
     where user_id = v_user_id
       and id = any(p_deleted_log_ids);
  end if;

  if array_length(p_deleted_log_dates, 1) is not null then
    delete from public.luma_daily_logs
     where user_id = v_user_id
       and date = any(p_deleted_log_dates);
  end if;

  for v_cycle in select * from jsonb_array_elements(coalesce(p_cycles, '[]'::jsonb))
  loop
    insert into public.luma_cycles (
      user_id, id, start_date, end_date, notes, created_at, updated_at
    )
    values (
      v_user_id,
      v_cycle->>'id',
      v_cycle->>'start_date',
      v_cycle->>'end_date',
      coalesce(v_cycle->>'notes', ''),
      v_cycle->>'created_at',
      v_cycle->>'updated_at'
    )
    on conflict (user_id, id) do update
      set start_date = excluded.start_date,
          end_date = excluded.end_date,
          notes = excluded.notes,
          updated_at = excluded.updated_at
    where excluded.updated_at >= public.luma_cycles.updated_at;
  end loop;

  for v_log in select * from jsonb_array_elements(coalesce(p_daily_logs, '[]'::jsonb))
  loop
    insert into public.luma_daily_logs (
      user_id, id, date, bleeding_flow, symptoms, mood, energy_level, sleep, notes, created_at, updated_at
    )
    values (
      v_user_id,
      v_log->>'id',
      v_log->>'date',
      v_log->>'bleeding_flow',
      coalesce(v_log->'symptoms', '[]'::jsonb),
      v_log->>'mood',
      v_log->>'energy_level',
      v_log->'sleep',
      coalesce(v_log->>'notes', ''),
      v_log->>'created_at',
      v_log->>'updated_at'
    )
    on conflict (user_id, date) do update
      set id = excluded.id,
          bleeding_flow = excluded.bleeding_flow,
          symptoms = excluded.symptoms,
          mood = excluded.mood,
          energy_level = excluded.energy_level,
          sleep = excluded.sleep,
          notes = excluded.notes,
          updated_at = excluded.updated_at
    where excluded.updated_at >= public.luma_daily_logs.updated_at;
  end loop;

  return jsonb_build_object(
    'status', 'synced',
    'server_revision', v_new_revision
  );
end;
$$;
`;
