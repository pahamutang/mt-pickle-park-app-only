-- ============================================================================
-- GCASH PAYMENT PROOF — run this in Supabase → SQL Editor → New query.
-- Safe to run multiple times (everything here is idempotent).
--
-- Players must now attach a screenshot of their GCash payment before a
-- reservation is saved. This adds:
--   1) a private storage bucket for the screenshots
--   2) a `payment_proofs` column on reservations (storage paths)
--   3) a server-side check so the rule can't be bypassed from the client
--
-- Depends on public.is_owner() (supabase_profiles_recursion_fix.sql) and
-- replaces restrict_reservation_update() from
-- supabase_reservation_merge_migration.sql (same rules + the new one).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Private bucket. Each player uploads into their own folder (<uid>/...).
--    The uploader and the owner can read; only the uploader can add/remove.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do update set public = false;

drop policy if exists "payment_proofs_insert_own" on storage.objects;
create policy "payment_proofs_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "payment_proofs_select_own_or_owner" on storage.objects;
create policy "payment_proofs_select_own_or_owner"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_owner()
    )
  );

drop policy if exists "payment_proofs_delete_own" on storage.objects;
create policy "payment_proofs_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 2) Column: storage paths of the screenshots attached to a reservation.
--    Existing reservations simply have none.
-- ----------------------------------------------------------------------------
alter table public.reservations
  add column if not exists payment_proofs text[] not null default '{}';

-- ----------------------------------------------------------------------------
-- 3) Enforce "no screenshot, no reservation" for players.
--    - INSERT by a non-owner must include at least one screenshot.
--    - UPDATE by a non-owner that ADDS hours must also add a screenshot.
--    The owner is exempt (they book on behalf of walk-ins).
-- ----------------------------------------------------------------------------
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
  return new;
end;
$$;

drop trigger if exists reservations_require_payment_proof on public.reservations;
create trigger reservations_require_payment_proof
  before insert
  on public.reservations
  for each row
  execute function public.require_payment_proof_on_insert();

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

  -- Adding more hours means more to pay, so it needs a new screenshot too.
  if coalesce(array_length(new.hours, 1), 0) > coalesce(array_length(old.hours, 1), 0)
     and coalesce(array_length(new.payment_proofs, 1), 0) <= coalesce(array_length(old.payment_proofs, 1), 0) then
    raise exception 'A GCash payment screenshot is required to add more time.';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
