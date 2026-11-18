create table if not exists public.participant_invitations (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.participant_invitations enable row level security;

revoke all on table public.participant_invitations from anon, authenticated;
grant select, insert, update on table public.participant_invitations to authenticated;
grant all on table public.participant_invitations to service_role;

create policy "participant_invitations_select_admins"
  on public.participant_invitations
  for select to authenticated
  using (private.has_event_role(array['super_admin', 'event_admin']));

create policy "participant_invitations_insert_admins"
  on public.participant_invitations
  for insert to authenticated
  with check (private.has_event_role(array['super_admin', 'event_admin']));

create policy "participant_invitations_update_admins"
  on public.participant_invitations
  for update to authenticated
  using (private.has_event_role(array['super_admin', 'event_admin']))
  with check (private.has_event_role(array['super_admin', 'event_admin']));

notify pgrst, 'reload schema';
