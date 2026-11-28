-- Restrict Lucky Draw machine and shared LED controller ownership to Super Admins.
-- Event Admins retain SELECT access to display and draw history.

create or replace function private.acquire_display_controller(p_lease_seconds integer default 90)
returns table(acquired boolean, controller_user_id uuid, lease_expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 90), 180));
begin
  if v_user_id is null or not private.has_event_role(array['super_admin']::text[]) then
    raise exception 'Only active Super Admins can control the Lucky Draw machine and LED display.' using errcode = '42501';
  end if;
  update public.display_state ds
  set active_controller_user_id = v_user_id,
      controller_lease_expires_at = now() + make_interval(secs => v_seconds),
      updated_by = v_user_id, updated_at = now()
  where ds.id = 1 and (
    ds.active_controller_user_id is null or ds.controller_lease_expires_at is null
    or ds.controller_lease_expires_at <= now() or ds.active_controller_user_id = v_user_id
  );
  if found then
    return query select true, ds.active_controller_user_id, ds.controller_lease_expires_at from public.display_state ds where ds.id = 1;
  else
    return query select false, ds.active_controller_user_id, ds.controller_lease_expires_at from public.display_state ds where ds.id = 1;
  end if;
end;
$function$;

create or replace function private.release_display_controller()
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.has_event_role(array['super_admin']::text[]) then
    raise exception 'Only active Super Admins can release Lucky Draw and LED display control.' using errcode = '42501';
  end if;
  update public.display_state ds
  set active_controller_user_id = null, controller_lease_expires_at = null,
      updated_by = v_user_id, updated_at = now()
  where ds.id = 1 and ds.active_controller_user_id = v_user_id;
  return found;
end;
$function$;

create or replace function private.enforce_display_controller()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_protected_keys text[] := array['box_phase','box_total','box_category','box_started_at','box_animation_id','machine_camera'];
begin
  if new.active_controller_user_id is distinct from old.active_controller_user_id
     or new.controller_lease_expires_at is distinct from old.controller_lease_expires_at then
    if v_user_id is null or not private.has_event_role(array['super_admin']::text[]) then
      raise exception 'Only active Super Admins can change LED controller ownership.' using errcode = '42501';
    end if;
    if new.active_controller_user_id = v_user_id then
      if old.active_controller_user_id is not null and old.active_controller_user_id <> v_user_id
         and old.controller_lease_expires_at > now() then
        raise exception 'The LED display is already controlled by another Super Admin.' using errcode = '42501';
      end if;
      if new.controller_lease_expires_at is null or new.controller_lease_expires_at <= now()
         or new.controller_lease_expires_at > now() + interval '3 minutes' then
        raise exception 'The LED controller lease must be between now and three minutes.' using errcode = '22023';
      end if;
    elsif new.active_controller_user_id is null then
      if old.active_controller_user_id is distinct from v_user_id then
        raise exception 'Only the current Super Admin controller can release control.' using errcode = '42501';
      end if;
      if new.controller_lease_expires_at is not null then
        raise exception 'A released LED controller cannot retain a lease.' using errcode = '22023';
      end if;
    else
      raise exception 'Invalid LED controller owner.' using errcode = '42501';
    end if;
  end if;
  if new.scene is distinct from old.scene or exists (
    select 1 from unnest(v_protected_keys) keys(protected_key)
    where (new.payload -> protected_key) is distinct from (old.payload -> protected_key)
  ) then
    if v_user_id is null or not private.has_event_role(array['super_admin']::text[])
       or old.active_controller_user_id is distinct from v_user_id
       or old.controller_lease_expires_at is null or old.controller_lease_expires_at <= now() then
      raise exception 'Only the current Super Admin LED controller can change the live display or Lucky Draw machine state.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop policy if exists display_state_update_admins on public.display_state;
create policy display_state_update_super_admin on public.display_state for update to authenticated
using (private.has_event_role(array['super_admin']::text[]))
with check (private.has_event_role(array['super_admin']::text[]));

drop policy if exists draw_entries_insert_controller on public.draw_entries;
create policy draw_entries_insert_super_admin_controller on public.draw_entries for insert to authenticated
with check (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
));
drop policy if exists draw_entries_update_controller on public.draw_entries;
create policy draw_entries_update_super_admin_controller on public.draw_entries for update to authenticated
using (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
))
with check (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
));
drop policy if exists draw_entries_delete_controller on public.draw_entries;
create policy draw_entries_delete_super_admin_controller on public.draw_entries for delete to authenticated
using (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
));

drop policy if exists draw_rounds_insert_controller on public.draw_rounds;
create policy draw_rounds_insert_super_admin_controller on public.draw_rounds for insert to authenticated
with check (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
));
drop policy if exists draw_rounds_update_controller on public.draw_rounds;
create policy draw_rounds_update_super_admin_controller on public.draw_rounds for update to authenticated
using (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
))
with check (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
));
drop policy if exists draw_rounds_delete_controller on public.draw_rounds;
create policy draw_rounds_delete_super_admin_controller on public.draw_rounds for delete to authenticated
using (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
));

drop policy if exists draw_winners_insert_controller on public.draw_winners;
create policy draw_winners_insert_super_admin_controller on public.draw_winners for insert to authenticated
with check (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
));
drop policy if exists draw_winners_update_controller on public.draw_winners;
create policy draw_winners_update_super_admin_controller on public.draw_winners for update to authenticated
using (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
))
with check (private.has_event_role(array['super_admin']::text[]) and exists (
  select 1 from public.display_state ds where ds.id=1 and ds.active_controller_user_id=(select auth.uid()) and ds.controller_lease_expires_at>now()
));
