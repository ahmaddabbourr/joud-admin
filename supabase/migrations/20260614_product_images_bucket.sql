-- Ensure the "product-images" storage bucket exists and is public,
-- with policies allowing public read and authenticated (admin) write access.

insert into storage.buckets (id, name, public, file_size_limit)
values ('product-images', 'product-images', true, 10485760) -- 10MB
on conflict (id) do update set public = true, file_size_limit = 10485760;

-- Public read access
create policy if not exists "Public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Authenticated (admin) users can upload
create policy if not exists "Authenticated upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

-- Authenticated (admin) users can update/replace
create policy if not exists "Authenticated update product images"
  on storage.objects for update
  using (bucket_id = 'product-images' and auth.role() = 'authenticated');

-- Authenticated (admin) users can delete
create policy if not exists "Authenticated delete product images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and auth.role() = 'authenticated');
