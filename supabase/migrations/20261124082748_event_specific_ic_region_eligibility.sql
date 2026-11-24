-- Store the event-specific IC eligibility rule in the existing event settings payload.
-- This preserves all current display and event settings and does not alter participant data.
UPDATE public.display_state
SET payload = COALESCE(payload, '{}'::jsonb)
  || jsonb_build_object(
    'ic_region_rule',
    jsonb_build_object(
      'enabled', true,
      'allowed_codes', jsonb_build_array('01', '23')
    )
  ),
  updated_at = now()
WHERE id = 1;
