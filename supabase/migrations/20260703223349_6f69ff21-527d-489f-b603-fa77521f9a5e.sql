
create policy "org members read logos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'org-logos'
  and exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid()
      and m.org_id::text = (storage.foldername(name))[1]
  )
);

create policy "org members write logos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'org-logos'
  and exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid()
      and m.org_id::text = (storage.foldername(name))[1]
  )
);

create policy "org members update logos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'org-logos'
  and exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid()
      and m.org_id::text = (storage.foldername(name))[1]
  )
);

create policy "org members delete logos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'org-logos'
  and exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid()
      and m.org_id::text = (storage.foldername(name))[1]
  )
);
