-- ============================================================================
-- CLEAR-FROM-LIST vs. RELEASE-SLOT — run in Supabase → SQL Editor → New query.
-- Safe to run multiple times.
--
-- The X on a PAID reservation no longer deletes it. It only clears it from
-- the list of whoever pressed it:
--   player_hidden = the player who made it cleared it from their own list
--   owner_hidden  = the owner cleared it from the owner's list
-- The row stays in the table, so the court time stays booked and paid, and
-- the other side still sees it. get_booked_slots() doesn't look at these
-- flags, so the availability grid is unaffected.
--
-- Only the owner can actually free a paid slot (delete the row). This file
-- enforces that server-side too, so an old cached app or a hand-made API
-- call can't delete a paid reservation.
--
-- Depends on: public.is_owner(), supabase_payment_verification_migration.sql.
-- Run this AFTER those.
-- ============================================================================

-- 1) The two flags. Existing rows start out visible to everyone.
alter table public.reservations
  add column if not exists player_hidden boolean not null default false,
  add column if not exists owner_hidden  boolean not null default false;

-- 2) Players may set player_hidden on their own row, but must never touch
--    owner_hidden. (Everything else is the same as the payment-verification
--    version of this function.)
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
  if new.owner_hidden <> old.owner_hidden then
    raise exception 'Only the owner can change the owner''s reservation list.';
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

-- 3) A player can no longer delete a reservation once it is paid. Unpaid,
--    pending and declined rows can still be cancelled/cleared as before.
--    auth.uid() is null for the SQL editor / service role / cascades, which
--    are left alone.
create or replace function public.block_paid_reservation_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_owner() then
    return old;
  end if;
  if old.is_paid and old.status <> 'declined' then
    raise exception 'Only the owner can release a paid reservation.';
  end if;
  return old;
end;
$$;

drop trigger if exists reservations_block_paid_delete on public.reservations;
create trigger reservations_block_paid_delete
  before delete
  on public.reservations
  for each row
  execute function public.block_paid_reservation_delete();

notify pgrst, 'reload schema';
