-- ============================================================================
-- COURT 2 OPEN/CLOSED TOGGLE — run in Supabase -> SQL Editor -> New query.
-- Safe to run multiple times (idempotent).
--
-- Lets the owner open or close Court 2 for reservations from the booking
-- screen. Everyone reads the same row (and gets live updates via realtime);
-- only the owner can change it. Until this is run, the app keeps Court 2
-- OPEN, exactly as before.
-- ============================================================================
create table if not exists public.court_settings (
  court text primary key,
  is_open boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.court_settings enable row level security;

drop policy if exists "court_settings_select_all" on public.court_settings;
create policy "court_settings_select_all"
  on public.court_settings for select
  to public
  using (true);

drop policy if exists "court_settings_insert_owner" on public.court_settings;
create policy "court_settings_insert_owner"
  on public.court_settings for insert
  to authenticated
  with check (public.is_owner());

drop policy if exists "court_settings_update_owner" on public.court_settings;
create policy "court_settings_update_owner"
  on public.court_settings for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

insert into public.court_settings (court, is_open)
values ('Court 2', true)
on conflict (court) do nothing;

-- Realtime so players see the change instantly.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'court_settings'
  ) then
    alter publication supabase_realtime add table public.court_settings;
  end if;
end $$;
