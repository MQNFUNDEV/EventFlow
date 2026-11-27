create or replace function public.delete_participant_permanently(p_participant_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_deleted boolean := false;
  v_batch_ids uuid[];
  v_event_admin_delete_enabled boolean := false;
  v_deleted_ic text;
  v_remaining_count integer := 0;
  v_remaining_id uuid;
begin
  if not private.has_event_role(array['super_admin']::text[]) then
    v_event_admin_delete_enabled := coalesce((select allow_event_admin_guest_deletion from public.admin_permissions where id = true), false);
    if not private.has_event_role(array['event_admin']::text[]) or not v_event_admin_delete_enabled then
      raise insufficient_privilege using message = 'Guest deletion is disabled for Event Admins. Ask a Super Admin for access.';
    end if;
  end if;

  select nullif(regexp_replace(coalesce(ic_number, ''), '\D', '', 'g'), '')
    into v_deleted_ic
  from public.participants
  where id = p_participant_id;

  select array_agg(distinct batch_id) into v_batch_ids
  from public.participant_import_rows
  where participant_id = p_participant_id;

  delete from public.draw_winners where participant_id = p_participant_id;
  delete from public.draw_entries where participant_id = p_participant_id;
  delete from public.attendance where participant_id = p_participant_id;
  delete from public.participant_invitations where participant_id = p_participant_id;
  delete from public.push_subscriptions where participant_id = p_participant_id;
  delete from public.audit_logs where entity_type = 'participant' and entity_id = p_participant_id::text;
  delete from public.participant_import_rows where participant_id = p_participant_id;

  if v_batch_ids is not null then
    update public.participant_import_batches b
    set source_row_count = (select count(*) from public.participant_import_rows r where r.batch_id = b.id),
        linked_participant_count = (select count(*) from public.participant_import_rows r where r.batch_id = b.id and r.participant_id is not null),
        issue_row_count = (select count(*) from public.participant_import_rows r where r.batch_id = b.id and cardinality(r.issue_types) > 0)
    where b.id = any(v_batch_ids) and exists (select 1 from public.participant_import_rows r where r.batch_id = b.id);

    delete from public.participant_import_batches b
    where b.id = any(v_batch_ids) and not exists (select 1 from public.participant_import_rows r where r.batch_id = b.id);
  end if;

  delete from public.participants where id = p_participant_id;
  v_deleted := found;

  -- When deletion resolves a two-record IC conflict, revise the sole remaining guest.
  if v_deleted and v_deleted_ic is not null then
    select count(*), (array_agg(id))[1]
      into v_remaining_count, v_remaining_id
    from public.participants
    where nullif(regexp_replace(coalesce(ic_number, ''), '\D', '', 'g'), '') = v_deleted_ic;

    if v_remaining_count = 1 then
      update public.participants
      set manual_revised_at = now(),
          updated_at = now(),
          import_issue_reasons = array(
            select reason
            from unnest(coalesce(import_issue_reasons, array[]::text[])) as reason
            where lower(reason) not like '%duplicate ic%'
              and lower(reason) not like '%duplicate registration%'
              and lower(reason) not like '%repeated registration%'
          ),
          needs_review = exists (
            select 1
            from unnest(coalesce(import_issue_reasons, array[]::text[])) as reason
            where lower(reason) not like '%duplicate ic%'
              and lower(reason) not like '%duplicate registration%'
              and lower(reason) not like '%repeated registration%'
          )
      where id = v_remaining_id;

      update public.participant_import_rows
      set issue_types = array(
        select issue_type
        from unnest(coalesce(issue_types, array[]::text[])) as issue_type
        where issue_type not in ('duplicate_ic', 'duplicate_registration')
      )
      where participant_id = v_remaining_id
        and issue_types && array['duplicate_ic', 'duplicate_registration']::text[];

      update public.participant_import_batches b
      set issue_row_count = (
        select count(*) from public.participant_import_rows r
        where r.batch_id = b.id and cardinality(r.issue_types) > 0
      )
      where exists (
        select 1 from public.participant_import_rows r
        where r.batch_id = b.id and r.participant_id = v_remaining_id
      );
    end if;
  end if;

  return v_deleted;
end;
$function$;
