-- ============================================================================
-- Players book without an account (Mt Pickle Park).
--
-- The app now gives a player's device a throwaway ANONYMOUS Supabase session
-- the first time they actually reserve a court (so the booking, its payment
-- screenshot, and cancelling their own booking have an id to belong to). Only
-- the owner signs in with email + password.
--
-- BEFORE running this, turn anonymous sign-ins ON in the Supabase dashboard:
--   Authentication -> Sign In / Providers -> "Allow anonymous sign-ins".
--
-- Every existing policy keeps working unchanged: an anonymous user is a normal
-- `authenticated` user with a profiles row (role 'player'), so the reservation
-- insert/cancel policies and the payment-proofs bucket policy apply to them
-- exactly as they did to a player account.
--
-- What this adds:
--  1) Visitors who haven't booked yet have NO session at all, so the public
--     availability grid and the photo carousel must be readable by `anon`.
--     Both are read-only and narrow: get_booked_slots() returns only
--     court + hour + paid flag (never a name or notes), and the reservations
--     table itself is NOT opened to signed-out visitors.
--  2) The owner is told "<name> just created an account" whenever a profiles
--     row appears. Guests would trigger that for every booking, so it is
--     skipped for anonymous users.
--
-- Safe to run more than once.
-- ============================================================================

-- 1a) Availability grid for visitors with no session.
grant execute on function public.get_booked_slots(date) to anon;

-- 1b) The venue photo carousel. (The storage bucket is already public-read.)
drop policy if exists "venue_photos_select_anon" on public.venue_photos;
create policy "venue_photos_select_anon"
  on public.venue_photos for select
  to anon
  using (true);
grant select on public.venue_photos to anon;

-- 2) No "new account" alert for a guest's throwaway booking session.
create or replace function public.notify_owner_of_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select u.is_anonymous from auth.users u where u.id = new.id), false) then
    return new;
  end if;

  -- Skip until an owner exists (the owner's own bootstrap signup shouldn't
  -- notify them about themselves).
  if exists (select 1 from public.profiles where role = 'owner') then
    insert into public.account_notifications (profile_id, display_name)
    values (new.id, new.display_name);
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
