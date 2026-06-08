-- Run in Supabase SQL editor. Grants the storefront (anon key, joud-oud)
-- the minimum access it actually needs, and tightens an over-broad policy.

-- REVIEWS: anon should only ever SEE approved reviews (storefront filters on
-- status="approved", but the existing "reviews_public_select" policy lets
-- anon read pending/rejected reviews too — leaks names/comments before moderation).
drop policy if exists "reviews_public_select" on public.reviews;

create policy "reviews_public_select_approved" on public.reviews
  for select to anon using (status = 'approved');
create policy "reviews_authenticated_select" on public.reviews
  for select to authenticated using (true);

-- ORDERS: storefront needs to INSERT a new order (checkout), but must never
-- be able to read back, edit, or delete orders (would expose customer data).
create policy "orders_anon_insert" on public.orders
  for insert to anon with check (true);

-- SETTINGS: storefront only reads the public "shipping_fees" key.
create policy "settings_anon_select_shipping" on public.settings
  for select to anon using (key = 'shipping_fees');

-- STORAGE: transfer-screenshots bucket — storefront uploads payment proof
-- on checkout. Anon may upload but NOT read/list/overwrite/delete others'
-- screenshots (those contain customer bank-transfer receipts).
create policy "transfer_screenshots_anon_insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'transfer-screenshots');

create policy "transfer_screenshots_authenticated_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'transfer-screenshots');

create policy "transfer_screenshots_authenticated_manage" on storage.objects
  for update to authenticated
  using (bucket_id = 'transfer-screenshots')
  with check (bucket_id = 'transfer-screenshots');

create policy "transfer_screenshots_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'transfer-screenshots');
