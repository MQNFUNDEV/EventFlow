insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-assets', 'event-assets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "eventflow_admins_read_event_assets"
  on storage.objects
  for select to authenticated
  using (bucket_id = 'event-assets' and private.has_event_role(array['super_admin', 'event_admin']));

create policy "eventflow_admins_upload_event_assets"
  on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-assets' and private.has_event_role(array['super_admin', 'event_admin']));

create policy "eventflow_admins_update_event_assets"
  on storage.objects
  for update to authenticated
  using (bucket_id = 'event-assets' and private.has_event_role(array['super_admin', 'event_admin']))
  with check (bucket_id = 'event-assets' and private.has_event_role(array['super_admin', 'event_admin']));
