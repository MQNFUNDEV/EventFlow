-- Preserve each uploaded participant file and its source rows independently.
create table if not exists public.participant_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null check (file_type in ('CSV','Excel')),
  uploaded_by uuid references auth.users(id) on delete set null,
  source_row_count integer not null default 0,
  linked_participant_count integer not null default 0,
  issue_row_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.participant_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.participant_import_batches(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  source_row_number integer not null,
  source_data jsonb not null default '{}'::jsonb,
  source_name text,
  source_ic text,
  issue_types text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (batch_id, source_row_number)
);

create index if not exists participant_import_batches_created_at_idx on public.participant_import_batches(created_at desc);
create index if not exists participant_import_rows_batch_id_idx on public.participant_import_rows(batch_id, source_row_number);
create index if not exists participant_import_rows_participant_id_idx on public.participant_import_rows(participant_id);
create index if not exists participant_import_rows_issue_types_idx on public.participant_import_rows using gin(issue_types);

alter table public.participant_import_batches enable row level security;
alter table public.participant_import_rows enable row level security;

drop policy if exists participant_import_batches_select_team on public.participant_import_batches;
create policy participant_import_batches_select_team on public.participant_import_batches for select to authenticated
using (private.has_event_role(array['super_admin','event_admin','front_desk']));
drop policy if exists participant_import_batches_insert_team on public.participant_import_batches;
create policy participant_import_batches_insert_team on public.participant_import_batches for insert to authenticated
with check (private.has_event_role(array['super_admin','event_admin','front_desk']));
drop policy if exists participant_import_batches_update_team on public.participant_import_batches;
create policy participant_import_batches_update_team on public.participant_import_batches for update to authenticated
using (private.has_event_role(array['super_admin','event_admin','front_desk']))
with check (private.has_event_role(array['super_admin','event_admin','front_desk']));
drop policy if exists participant_import_batches_delete_super_admin on public.participant_import_batches;
create policy participant_import_batches_delete_super_admin on public.participant_import_batches for delete to authenticated
using (private.has_event_role(array['super_admin']));

drop policy if exists participant_import_rows_select_team on public.participant_import_rows;
create policy participant_import_rows_select_team on public.participant_import_rows for select to authenticated
using (private.has_event_role(array['super_admin','event_admin','front_desk']));
drop policy if exists participant_import_rows_insert_team on public.participant_import_rows;
create policy participant_import_rows_insert_team on public.participant_import_rows for insert to authenticated
with check (private.has_event_role(array['super_admin','event_admin','front_desk']));
drop policy if exists participant_import_rows_delete_super_admin on public.participant_import_rows;
create policy participant_import_rows_delete_super_admin on public.participant_import_rows for delete to authenticated
using (private.has_event_role(array['super_admin']));
