-- ============================================================================
-- Lets the OWNER delete payment screenshots (needed so the app can remove a
-- screenshot right after the owner accepts the payment).
-- Run in Supabase -> SQL Editor -> New query. Safe to run multiple times.
-- Depends on public.is_owner() and the payment-proofs bucket from
-- supabase_payment_proof_migration.sql.
-- ============================================================================
drop policy if exists "payment_proofs_delete_owner" on storage.objects;
create policy "payment_proofs_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.is_owner()
  );
