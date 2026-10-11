-- Product image bucket. Object path convention: <organization_id>/<product_id>/<uuid>.<ext>
-- Guarded so the migrations also run in plain Postgres (tests), where the storage schema doesn't exist.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

  -- Public bucket: anyone with a URL can read product photos (needed by the storefront).
  -- Writes require manager+ in the organization named by the first path segment.
  execute $p$create policy "product images insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'product-images'
                and public.is_member(((storage.foldername(name))[1])::uuid, 'manager'))$p$;
  execute $p$create policy "product images update" on storage.objects for update to authenticated
    using (bucket_id = 'product-images'
           and public.is_member(((storage.foldername(name))[1])::uuid, 'manager'))$p$;
  execute $p$create policy "product images delete" on storage.objects for delete to authenticated
    using (bucket_id = 'product-images'
           and public.is_member(((storage.foldername(name))[1])::uuid, 'manager'))$p$;
end $$;
