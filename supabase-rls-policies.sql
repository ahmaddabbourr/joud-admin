-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Locks down admin tables so only authenticated users (your admin login)
-- can read/write them. Public storefront reads still need their own
-- public-read policies if your storefront also queries these tables directly
-- with the anon key (e.g. products, categories, reviews) — add separate
-- "anon can SELECT" policies for those if needed.

-- ORDERS: admin-only, no public access
alter table public.orders enable row level security;

create policy "orders_authenticated_select" on public.orders
  for select to authenticated using (true);
create policy "orders_authenticated_insert" on public.orders
  for insert to authenticated with check (true);
create policy "orders_authenticated_update" on public.orders
  for update to authenticated using (true) with check (true);
create policy "orders_authenticated_delete" on public.orders
  for delete to authenticated using (true);

-- PRODUCTS: public can read, only authenticated admins can write
alter table public.products enable row level security;

create policy "products_public_select" on public.products
  for select to anon, authenticated using (true);
create policy "products_authenticated_insert" on public.products
  for insert to authenticated with check (true);
create policy "products_authenticated_update" on public.products
  for update to authenticated using (true) with check (true);
create policy "products_authenticated_delete" on public.products
  for delete to authenticated using (true);

-- CATEGORIES: public can read, only authenticated admins can write
alter table public.categories enable row level security;

create policy "categories_public_select" on public.categories
  for select to anon, authenticated using (true);
create policy "categories_authenticated_insert" on public.categories
  for insert to authenticated with check (true);
create policy "categories_authenticated_update" on public.categories
  for update to authenticated using (true) with check (true);
create policy "categories_authenticated_delete" on public.categories
  for delete to authenticated using (true);

-- REVIEWS: public can read + submit (for storefront), only admins moderate/delete
alter table public.reviews enable row level security;

create policy "reviews_public_select" on public.reviews
  for select to anon, authenticated using (true);
create policy "reviews_public_insert" on public.reviews
  for insert to anon, authenticated with check (true);
create policy "reviews_authenticated_update" on public.reviews
  for update to authenticated using (true) with check (true);
create policy "reviews_authenticated_delete" on public.reviews
  for delete to authenticated using (true);

-- SETTINGS: admin-only, no public access
alter table public.settings enable row level security;

create policy "settings_authenticated_select" on public.settings
  for select to authenticated using (true);
create policy "settings_authenticated_insert" on public.settings
  for insert to authenticated with check (true);
create policy "settings_authenticated_update" on public.settings
  for update to authenticated using (true) with check (true);
create policy "settings_authenticated_delete" on public.settings
  for delete to authenticated using (true);

-- STORAGE: product-images bucket — public read, only authenticated can upload/replace/delete
create policy "product_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

create policy "product_images_authenticated_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images');

create policy "product_images_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product_images_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images');
