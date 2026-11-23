alter table public.participants
  add column if not exists form_timestamp text,
  add column if not exists ic_number text,
  add column if not exists student_id text,
  add column if not exists university_name text,
  add column if not exists gender text,
  add column if not exists race text;
