-- ============================================================================
-- OWNER PAYMENT VERIFICATION — run in Supabase → SQL Editor → New query.
-- Safe to run multiple times.
--
-- A player's GCash reservation is now "pending" until the owner approves it
-- (after checking the screenshot against their own GCash notification).
--   pending  -> slot is held, waiting for the owner (never expires)
--   approved -> confirmed and marked paid
--   declined -> slot is free again; only the player who made it still sees it
--
-- Depends on: public.is_owner(), supabase_payment_proof_migration.sql,
-- supabase_double_booking_migration.sql. Run this AFTER those.
-- ============================================================================

-- 1) status column. Default 'approved' so owner-made bookings are confirmed.
--    First run only: existing unpaid player bookings with a screenshot become
--    'pending' so the owner can review them.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reservations' and column_name = 'status'
  ) then
    alter table public.reservations
      add column status text not null default 'approved'
      check (status in ('pending', 'approved', 'declined'));

    update public.reservations
       set status = 'pending'
     where is_paid = false
       and coalesce(array_length(payment_proofs, 1), 0) > 0;
  end if;
end $$;

-- 2) Players can only ever create PENDING, unpaid reservations (with a screenshot).
create or replace function public.require_payment_proof_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_owner() then
    return new;
  end if;
  if coalesce(array_length(new.payment_proofs, 1), 0) < 1 then
    raise exception 'A GCash payment screenshot is required to reserve a court.';
  end if;
  new.status := 'pending';
  new.is_paid := false;
  return new;
end;
$$;

-- 3) Players can't touch status/paid, and can only add hours to a row that is
--    still pending (extra hours on an approved booking must be a new request).
create or replace function public.restrict_reservation_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_owner() then
    return new;
  end if;

  if new.created_by <> old.created_by then
    raise exception 'You can only update your own reservation.';
  end if;
  if new.court <> old.court
     or new.date <> old.date
     or new.customer_name <> old.customer_name
     or new.is_paid <> old.is_paid
     or new.status <> old.status then
    raise exception 'Only the owner can change the court, date, customer name, paid status, or verification status of a reservation.';
  end if;

  if coalesce(array_length(new.hours, 1), 0) > coalesce(array_length(old.hours, 1), 0) then
    if old.status <> 'pending' then
      raise exception 'Extra time on a verified reservation must be booked as a new request.';
    end if;
    if coalesce(array_length(new.payment_proofs, 1), 0) <= coalesce(array_length(old.payment_proofs, 1), 0) then
      raise exception 'A GCash payment screenshot is required to add more time.';
    end if;
  end if;

  return new;
end;
$$;

-- 4) Pending rows hold their slot; declined rows don't.
create or replace function public.prevent_double_booking()
returns trigger
language plpgsql
as $$
declare
  lock_key bigint;
  conflict_id uuid;
  conflict_hours int[];
begin
  if new.status = 'declined' then
    return new;
  end if;

  lock_key := hashtextextended(new.court || '|' || new.date::text, 0);
  perform pg_advisory_xact_lock(lock_key);

  select id, hours
    into conflict_id, conflict_hours
  from public.reservations
  where court = new.court
    and date = new.date
    and status <> 'declined'
    and hours && new.hours
    and id is distinct from new.id
  limit 1;

  if conflict_id is not null then
    raise exception
      'This slot on % (court %) was just booked by someone else. Please choose another time.',
      new.date, new.court
      using errcode = '23505',
            detail = format('conflicting_reservation_id=%s conflicting_hours=%s', conflict_id, conflict_hours);
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_prevent_double_booking on public.reservations;
create trigger reservations_prevent_double_booking
  before insert or update of court, date, hours, status
  on public.reservations
  for each row
  execute function public.prevent_double_booking();

-- 5) The availability grid ignores declined rows (so the slot reopens).
create or replace function public.get_booked_slots(p_date date)
returns table (court text, hour int, is_paid boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.court, h.hour, r.is_paid
  from public.reservations r,
       unnest(r.hours) as h(hour)
  where r.date = p_date
    and r.status <> 'declined';
$$;

grant execute on function public.get_booked_slots(date) to authenticated;

notify pgrst, 'reload schema';
