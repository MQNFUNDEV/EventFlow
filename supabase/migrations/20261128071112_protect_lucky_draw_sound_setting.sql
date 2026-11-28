-- Include the Lucky Draw sound toggle among Super Admin-only machine settings.
create or replace function private.enforce_display_controller()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare
 v_user_id uuid := (select auth.uid());
 v_machine_keys text[] := array['box_phase','box_total','box_category','box_started_at','box_animation_id','machine_camera','sound_enabled'];
begin
 if new.active_controller_user_id is distinct from old.active_controller_user_id or new.controller_lease_expires_at is distinct from old.controller_lease_expires_at then
  if v_user_id is null or not private.has_event_role(array['super_admin','event_admin']::text[]) then
   raise exception 'Only active administrators can change LED controller ownership.' using errcode='42501';
  end if;
  if new.active_controller_user_id=v_user_id then
   if old.active_controller_user_id is not null and old.active_controller_user_id<>v_user_id and old.controller_lease_expires_at>now()
    and not (private.has_event_role(array['super_admin']::text[]) and exists(select 1 from public.admin_roles ar where ar.user_id=old.active_controller_user_id and ar.is_active and ar.role='event_admin')) then
    raise exception 'The LED display is already controlled by another administrator.' using errcode='42501';
   end if;
   if new.controller_lease_expires_at is null or new.controller_lease_expires_at<=now() or new.controller_lease_expires_at>now()+interval '3 minutes' then
    raise exception 'The LED controller lease must be between now and three minutes.' using errcode='22023';
   end if;
  elsif new.active_controller_user_id is null then
   if old.active_controller_user_id is distinct from v_user_id then raise exception 'Only the current LED controller can release control.' using errcode='42501'; end if;
   if new.controller_lease_expires_at is not null then raise exception 'A released LED controller cannot retain a lease.' using errcode='22023'; end if;
  else raise exception 'Invalid LED controller owner.' using errcode='42501';
  end if;
 end if;
 if new.scene is distinct from old.scene then
  if v_user_id is null or old.active_controller_user_id is distinct from v_user_id or old.controller_lease_expires_at is null or old.controller_lease_expires_at<=now() then
   raise exception 'Only the current LED controller can change the live display scene.' using errcode='42501';
  end if;
 end if;
 if exists(select 1 from unnest(v_machine_keys) keys(protected_key) where (new.payload->protected_key) is distinct from (old.payload->protected_key)) then
  if v_user_id is null or not private.has_event_role(array['super_admin']::text[]) or old.active_controller_user_id is distinct from v_user_id
   or old.controller_lease_expires_at is null or old.controller_lease_expires_at<=now() then
   raise exception 'Only the current Super Admin controller can change Lucky Draw machine state.' using errcode='42501';
  end if;
 end if;
 return new;
end;$function$;
