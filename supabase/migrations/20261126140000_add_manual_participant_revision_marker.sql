alter table public.participants
  add column if not exists manual_revised_at timestamptz;

comment on column public.participants.manual_revised_at is
  'Timestamp of the most recent real manual guest edit by an admin. Spreadsheet imports and automated review flags must not set this field.';
