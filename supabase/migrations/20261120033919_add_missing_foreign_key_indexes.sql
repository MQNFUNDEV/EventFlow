CREATE INDEX IF NOT EXISTS development_log_entries_created_by_idx
  ON public.development_log_entries (created_by);

CREATE INDEX IF NOT EXISTS development_log_sessions_created_by_idx
  ON public.development_log_sessions (created_by);

CREATE INDEX IF NOT EXISTS participant_invitations_updated_by_idx
  ON public.participant_invitations (updated_by);
