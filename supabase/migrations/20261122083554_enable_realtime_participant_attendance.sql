-- Keep open operator screens in sync when another admin adds or updates a guest
-- or records an attendance check-in. RLS still controls which rows each user sees.
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants, public.attendance;
