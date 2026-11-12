-- ============================================================================
-- HIDE (INSTEAD OF DELETE) A PAID RESERVATION
-- Run in Supabase -> SQL Editor -> New query. Safe to run multiple times.
-- Depends on supabase_reservation_merge_migration.sql having been run
-- already (it creates restrict_reservation_update(), which this replaces).
--
-- Once a reservation is paid, it should never be deleted from this point on
-- (deleting it would free the slot back up, even though it was paid for).
-- Instead, the player and the owner can each clear it from their own list
-- independently: hidden_by_player hides it from the player who made it,
-- hidden_by_owner hides it from the owner. Neither affects what the other
-- side sees, and the booking grid still shows the slot as taken either way.
-- ============================================================================

alter table public.reservations
  add column if not exists hidden_by_player boolean not null default false,
  add column if not exists hidden_by_owner boolean not null default false;

-- Extends the existing update trigger (restrict_reservation_update, from
-- supabase_reservation_merge_migration.sql) with one more rule: a non-owner
-- can set hidden_by_player on their own row (already allowed, since it's
-- not in the blocked list below) but can't touch hidden_by_owner — only the
-- owner can clear their own copy. The owner stays fully unrestricted, same
-- as every other column.
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
     or new.is_paid <> old.is_paid then
    raise exception 'Only the owner can change the court, date, customer name, or paid status of a reservation.';
  end if;
  if new.hidden_by_owner <> old.hidden_by_owner then
    raise exception 'Only the owner can clear a reservation from the owner''s own list.';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
