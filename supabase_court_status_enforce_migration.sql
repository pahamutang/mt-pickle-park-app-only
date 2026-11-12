-- ============================================================================
-- ENFORCE COURT OPEN/CLOSED STATUS ON THE RESERVATIONS TABLE
-- Run in Supabase -> SQL Editor -> New query. Safe to run multiple times
-- (re-running replaces the function/trigger below, so this also fixes the
-- bug in an earlier version of this file — see note at the bottom).
-- Depends on supabase_court_status_migration.sql having been run already
-- (it creates the court_status table this reads from).
--
-- The app's booking grid already hides a closed court behind an "Open
-- Play" sign instead of bookable cells, but that's only the client-side
-- check — same reasoning as supabase_court3_coming_soon.sql's comment:
-- someone calling the API directly could otherwise still book a court
-- the owner closed. This makes the database refuse it too, for anyone
-- who isn't the owner (the owner can still book a closed court on a
-- walk-in's behalf — closed just means "not bookable through the app
-- by players", not "nobody can play there").
--
-- Only Court 1 is under owner-controlled open/close right now — every
-- other court is always bookable and ignores its court_status row
-- entirely (see COURT_STATUS_MANAGED_COURTS in src/bookingTypes.ts). The
-- list below must be kept in sync with that constant by hand: add a
-- court's exact name to both places together if you ever bring another
-- court under this switch.
-- ============================================================================

create or replace function public.require_open_court_for_player_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  managed_courts text[] := array['Court 1'];
  court_open boolean;
begin
  if public.is_owner() then
    return new;
  end if;

  -- A court not in this list is always bookable — its court_status row,
  -- if it even has one, is never consulted.
  if not (new.court = any(managed_courts)) then
    return new;
  end if;

  select is_open into court_open from public.court_status where court = new.court;
  -- No row yet for this court (migration just ran, or a court was added
  -- since) is treated the same as closed — the safe default, matching
  -- the app's own isOpen() fallback.
  if coalesce(court_open, false) = false then
    raise exception '% is closed for online booking right now.', new.court;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_require_open_court on public.reservations;
create trigger reservations_require_open_court
  before insert
  on public.reservations
  for each row
  execute function public.require_open_court_for_player_booking();

notify pgrst, 'reload schema';

-- NOTE on the earlier version of this file: it checked EVERY court
-- against court_status, not just Court 1. Since supabase_court_status_
-- migration.sql defaults every court to is_open = false, that older
-- version would have silently blocked Court 2 (and Court 3) bookings at
-- the database level too, even once the app's own code stopped treating
-- Court 2 as closeable. If you already ran that earlier version, running
-- this one replaces it — no separate rollback step needed.
