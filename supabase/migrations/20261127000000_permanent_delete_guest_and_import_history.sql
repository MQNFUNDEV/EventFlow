create or replace function public.delete_participant_permanently(p_participant_id uuid)
returns boolean language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare v_deleted boolean := false; v_batch_ids uuid[];
begin
  if not private.has_event_role(array['super_admin']::text[]) then
    raise insufficient_privilege using message = 'Only a Super Admin can permanently delete a guest.';
  end if;
  select array_agg(distinct batch_id) into v_batch_ids
  from public.participant_import_rows where participant_id = p_participant_id;
  delete from public.draw_winners where participant_id = p_participant_id;
  delete from public.draw_entries where participant_id = p_participant_id;
  delete from public.attendance where participant_id = p_participant_id;
  delete from public.participant_invitations where participant_id = p_participant_id;
  delete from public.push_subscriptions where participant_id = p_participant_id;
  delete from public.audit_logs where entity_type = 'participant' and entity_id = p_participant_id::text;
  delete from public.participant_import_rows where participant_id = p_participant_id;
  if v_batch_ids is not null then
    delete from public.participant_import_batches b
    where b.id = any(v_batch_ids)
      and not exists (select 1 from public.participant_import_rows r where r.batch_id = b.id);
  end if;
  delete from public.participants where id = p_participant_id;
  v_deleted := found;
  return v_deleted;
end;
$function$;

create or replace function public.clear_participant_directory()
returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_winners integer; v_entries integer; v_attendance integer; v_rounds integer;
  v_participants integer; v_import_rows integer; v_import_batches integer;
  v_audit_logs integer; v_push_subscriptions integer; v_invitations integer;
begin
  if not private.has_event_role(array['super_admin']::text[]) then
    raise insufficient_privilege using message = 'Only a Super Admin can clear the participant directory.';
  end if;
  delete from public.draw_winners; get diagnostics v_winners = row_count;
  delete from public.draw_entries; get diagnostics v_entries = row_count;
  delete from public.attendance; get diagnostics v_attendance = row_count;
  delete from public.participant_invitations; get diagnostics v_invitations = row_count;
  delete from public.push_subscriptions; get diagnostics v_push_subscriptions = row_count;
  delete from public.audit_logs where entity_type = 'participant'; get diagnostics v_audit_logs = row_count;
  delete from public.participant_import_rows; get diagnostics v_import_rows = row_count;
  delete from public.participant_import_batches; get diagnostics v_import_batches = row_count;
  delete from public.draw_rounds; get diagnostics v_rounds = row_count;
  delete from public.participants; get diagnostics v_participants = row_count;
  return jsonb_build_object(
    'participants_deleted', v_participants, 'attendance_deleted', v_attendance,
    'draw_entries_deleted', v_entries, 'draw_winners_deleted', v_winners,
    'draw_rounds_deleted', v_rounds, 'participant_import_rows_deleted', v_import_rows,
    'participant_import_batches_deleted', v_import_batches,
    'participant_audit_logs_deleted', v_audit_logs,
    'push_subscriptions_deleted', v_push_subscriptions,
    'participant_invitations_deleted', v_invitations
  );
end;
$function$;
