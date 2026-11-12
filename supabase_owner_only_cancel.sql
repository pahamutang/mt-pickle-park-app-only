-- ============================================================================
-- OWNER-ONLY CANCELLATION (from the View Reservation screen)
-- Run in Supabase -> SQL Editor -> New query. Safe to run multiple times.
--
-- Until now a player could cancel any reservation they created themselves.
-- The View Reservation screen's Cancel button is now owner-only, and this
-- matches that at the database level too, with one exception: a player can
-- still delete a reservation of their own in the first 2 minutes after
-- creating it. That's not a loophole for cancelling from the app's UI — it's
-- what lets the app silently undo a reservation of theirs that failed to go
-- through right after they made it (e.g. they booked 3 courts and only 2
-- went through, so the app cancels those 2 rather than leaving a partial,
-- unwanted booking). After that short window, only the owner can delete it.
-- ============================================================================

drop policy if exists "reservations_delete_owner_or_own" on public.reservations;
drop policy if exists "reservations_delete_owner_only" on public.reservations;
create policy "reservations_delete_owner_or_own_recent"
  on public.reservations for delete
  to authenticated
  using (
    (created_by = auth.uid() and created_at > now() - interval '2 minutes')
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'owner'
    )
  );

notify pgrst, 'reload schema';
