-- Permit the uploading operator to write the final import-batch summary after its source rows are recorded.
drop policy if exists participant_import_batches_update_team on public.participant_import_batches;
create policy participant_import_batches_update_team on public.participant_import_batches for update to authenticated
using (private.has_event_role(array['super_admin','event_admin','front_desk']))
with check (private.has_event_role(array['super_admin','event_admin','front_desk']));
