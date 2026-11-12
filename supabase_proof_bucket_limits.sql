-- ============================================================================
-- OPTIONAL: lock the payment-proofs bucket to real images, max 10 MB.
-- Run in Supabase -> SQL Editor. Safe to run more than once.
-- The app now checks this before uploading; this makes the server enforce it
-- too, so a hand-made request can't store a huge or non-image file.
-- ============================================================================
update storage.buckets
   set file_size_limit    = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'payment-proofs';
