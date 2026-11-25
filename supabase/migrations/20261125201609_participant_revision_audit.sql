
create or replace function public.log_participant_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_changed_fields jsonb;
  v_actor_email text;
begin
  select ar.role
    into v_actor_role
  from public.admin_roles ar
  where ar.user_id = (select auth.uid())
    and ar.is_active
  limit 1;

  v_actor_email := coalesce(auth.jwt() ->> 'email', 'Unknown admin');

  if tg_op = 'INSERT' then
    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, details
    ) values (
      auth.uid(),
      'participant_created',
      'participant',
      new.id::text,
      jsonb_build_object(
        'actor_email', v_actor_email,
        'actor_role', coalesce(v_actor_role, 'unknown'),
        'new_values', to_jsonb(new) - array['qr_token']
      )
    );
    return new;
  end if;

  select coalesce(
    jsonb_object_agg(
      coalesce(new_entry.key, old_entry.key),
      jsonb_build_object('old', old_entry.value, 'new', new_entry.value)
    ),
    '{}'::jsonb
  )
  into v_changed_fields
  from jsonb_each(to_jsonb(new) - array['created_at', 'updated_at', 'qr_token']) as new_entry
  full join jsonb_each(to_jsonb(old) - array['created_at', 'updated_at', 'qr_token']) as old_entry
    on new_entry.key = old_entry.key
  where new_entry.value is distinct from old_entry.value;

  if v_changed_fields <> '{}'::jsonb then
    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, details
    ) values (
      auth.uid(),
      'participant_updated',
      'participant',
      new.id::text,
      jsonb_build_object(
        'actor_email', v_actor_email,
        'actor_role', coalesce(v_actor_role, 'unknown'),
        'changed_fields', v_changed_fields
      )
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists participants_log_revision on public.participants;
create trigger participants_log_revision
after insert or update on public.participants
for each row execute function public.log_participant_revision();

revoke all on function public.log_participant_revision() from public, anon, authenticated;
