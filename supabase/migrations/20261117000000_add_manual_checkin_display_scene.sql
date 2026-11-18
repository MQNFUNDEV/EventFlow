ALTER TABLE public.display_state
  DROP CONSTRAINT IF EXISTS display_state_scene_check;

ALTER TABLE public.display_state
  ADD CONSTRAINT display_state_scene_check
  CHECK (scene = ANY (ARRAY[
    'welcome'::text,
    'attendance'::text,
    'sponsors'::text,
    'lucky_draw'::text,
    'winner_announcement'::text,
    'blackout'::text,
    'manual_checkin'::text
  ]));
