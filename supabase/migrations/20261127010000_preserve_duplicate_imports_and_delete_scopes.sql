-- Uploaded guest rows are independent submissions. Allow multiple records with the same IC.
drop index if exists public.participants_ic_number_unique;

create or replace function public.delete_import_batch(p_batch_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_participant_ids uuid[];
  v_rows_deleted integer := 0;
  v_participants_deleted integer := 0;
  v_batch_deleted integer := 0;
  v_id uuid;
begin
  if not private.has_event_role(array['super_admin']::text[]) then
    raise insufficient_privilege using message = 'Only a Super Admin can permanently delete an uploaded list.';
  end if;
  if not exists (select 1 from public.participant_import_batches where id = p_batch_id) then
    raise no_data_found using message = 'The uploaded list could not be found.';
  end if;
  select array_agg(distinct participant_id) into v_participant_ids
  from public.participant_import_rows where batch_id = p_batch_id and participant_id is not null;
  delete from public.participant_import_rows where batch_id = p_batch_id;
  get diagnostics v_rows_deleted = row_count;
  foreach v_id in array coalesce(v_participant_ids, array[]::uuid[]) loop
    if not exists (select 1 from public.participant_import_rows where participant_id = v_id) then
      delete from public.draw_winners where participant_id = v_id;
      delete from public.draw_entries where participant_id = v_id;
      delete from public.attendance where participant_id = v_id;
      delete from public.participant_invitations where participant_id = v_id;
      delete from public.push_subscriptions where participant_id = v_id;
      delete from public.audit_logs where entity_type = 'participant' and entity_id = v_id::text;
      delete from public.participants where id = v_id;
      if found then v_participants_deleted := v_participants_deleted + 1; end if;
    end if;
  end loop;
  delete from public.participant_import_batches where id = p_batch_id;
  get diagnostics v_batch_deleted = row_count;
  return jsonb_build_object('source_rows_deleted',v_rows_deleted,'participants_deleted',v_participants_deleted,'batches_deleted',v_batch_deleted);
end;
$function$;

create or replace function public.delete_participant_category(p_category_id text,p_category_name text default null)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_participant_ids uuid[];
  v_participants_deleted integer := 0;
  v_source_rows_deleted integer := 0;
  v_batches_deleted integer := 0;
  v_id uuid;
  v_normal_id text := regexp_replace(lower(coalesce(p_category_id,'')), '[^a-z0-9]', '', 'g');
  v_normal_name text := regexp_replace(lower(coalesce(p_category_name,'')), '[^a-z0-9]', '', 'g');
begin
  if not private.has_event_role(array['super_admin']::text[]) then
    raise insufficient_privilege using message = 'Only a Super Admin can permanently delete guests by category.';
  end if;
  if nullif(trim(p_category_id), '') is null then
    raise invalid_parameter_value using message = 'A category must be selected.';
  end if;
  select array_agg(id) into v_participant_ids from public.participants where category = p_category_id;
  foreach v_id in array coalesce(v_participant_ids, array[]::uuid[]) loop
    delete from public.draw_winners where participant_id = v_id;
    delete from public.draw_entries where participant_id = v_id;
    delete from public.attendance where participant_id = v_id;
    delete from public.participant_invitations where participant_id = v_id;
    delete from public.push_subscriptions where participant_id = v_id;
    delete from public.audit_logs where entity_type = 'participant' and entity_id = v_id::text;
    delete from public.participant_import_rows where participant_id = v_id;
    delete from public.participants where id = v_id;
    if found then v_participants_deleted := v_participants_deleted + 1; end if;
  end loop;
  delete from public.participant_import_rows r
  where r.participant_id is null
    and exists (
      select 1 from jsonb_each_text(coalesce(r.source_data, '{}'::jsonb)) e
      where regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g') =
        any(array['category','kategori','participantcategory','studentstaff','staffstudent','employmentstatus','jenispenyertaan','jenispeserta','statuspeserta'])
        and regexp_replace(lower(trim(e.value)), '[^a-z0-9]', '', 'g') in (v_normal_id, v_normal_name)
    );
  get diagnostics v_source_rows_deleted = row_count;
  delete from public.participant_import_batches b
  where not exists (select 1 from public.participant_import_rows r where r.batch_id = b.id);
  get diagnostics v_batches_deleted = row_count;
  return jsonb_build_object('participants_deleted',v_participants_deleted,'unlinked_source_rows_deleted',v_source_rows_deleted,'empty_batches_deleted',v_batches_deleted);
end;
$function$;

revoke all on function public.delete_import_batch(uuid) from public;
revoke all on function public.delete_participant_category(text,text) from public;
grant execute on function public.delete_import_batch(uuid) to authenticated;
grant execute on function public.delete_participant_category(text,text) to authenticated;
