create table if not exists public.admin_permissions (
  id boolean primary key default true check (id = true),
  allow_event_admin_guest_deletion boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.admin_permissions enable row level security;
revoke all on table public.admin_permissions from anon, authenticated;
grant all on table public.admin_permissions to service_role;

create or replace function public.delete_participant_permanently(p_participant_id uuid)
returns boolean language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_deleted boolean := false;
  v_batch_ids uuid[];
  v_event_admin_delete_enabled boolean := false;
begin
  if not private.has_event_role(array['super_admin']::text[]) then
    v_event_admin_delete_enabled := coalesce((select allow_event_admin_guest_deletion from public.admin_permissions where id = true), false);
    if not private.has_event_role(array['event_admin']::text[]) or not v_event_admin_delete_enabled then
      raise insufficient_privilege using message = 'Guest deletion is disabled for Event Admins. Ask a Super Admin for access.';
    end if;
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
    update public.participant_import_batches b
    set source_row_count = (select count(*) from public.participant_import_rows r where r.batch_id = b.id),
        linked_participant_count = (select count(*) from public.participant_import_rows r where r.batch_id = b.id and r.participant_id is not null),
        issue_row_count = (select count(*) from public.participant_import_rows r where r.batch_id = b.id and cardinality(r.issue_types) > 0)
    where b.id = any(v_batch_ids)
      and exists (select 1 from public.participant_import_rows r where r.batch_id = b.id);
    delete from public.participant_import_batches b
    where b.id = any(v_batch_ids)
      and not exists (select 1 from public.participant_import_rows r where r.batch_id = b.id);
  end if;
  delete from public.participants where id = p_participant_id;
  v_deleted := found;
  return v_deleted;
end;
$function$;
