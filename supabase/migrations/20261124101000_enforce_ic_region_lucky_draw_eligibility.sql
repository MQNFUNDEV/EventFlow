-- Enforce event-specific IC eligibility for Lucky Draw entries.
-- Attendees and attendance records are intentionally retained.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_draw_entry_ic_region_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rule jsonb;
  v_allowed_codes text[];
  v_ic text;
  v_normalized_ic text;
BEGIN
  SELECT COALESCE(ds.payload -> 'ic_region_rule', '{}'::jsonb)
    INTO v_rule
  FROM public.display_state AS ds
  WHERE ds.id = 1;

  IF COALESCE(v_rule ->> 'enabled', 'false') <> 'true' THEN
    RETURN NEW;
  END IF;

  -- Inserts and transitions into the drawable queue must always be checked.
  IF TG_OP = 'INSERT' OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
     OR NEW.queue_status = 'pending' THEN
    SELECT COALESCE(array_agg(code), ARRAY[]::text[])
      INTO v_allowed_codes
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(v_rule -> 'allowed_codes') = 'array'
          THEN v_rule -> 'allowed_codes'
        ELSE '[]'::jsonb
      END
    ) AS allowed(code);

    SELECT p.ic_number
      INTO v_ic
    FROM public.participants AS p
    WHERE p.id = NEW.participant_id;

    IF v_ic IS NULL
       OR NOT (
         btrim(v_ic) ~ '^[0-9]{6}-[0-9]{2}-[0-9]{4}$'
         OR btrim(v_ic) ~ '^[0-9]{12}$'
       ) THEN
      RAISE EXCEPTION 'Participant is not eligible for this Lucky Draw. A valid IC is required for allowed region codes: %.',
        array_to_string(v_allowed_codes, ', ')
        USING ERRCODE = '23514';
    END IF;

    v_normalized_ic := replace(btrim(v_ic), '-', '');
    IF NOT (substring(v_normalized_ic FROM 7 FOR 2) = ANY(v_allowed_codes)) THEN
      RAISE EXCEPTION 'Participant is not eligible for this Lucky Draw. Allowed IC region codes: %.',
        array_to_string(v_allowed_codes, ', ')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_draw_entry_ic_region_eligibility() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_draw_entry_ic_region_eligibility ON public.draw_entries;
CREATE TRIGGER trg_enforce_draw_entry_ic_region_eligibility
BEFORE INSERT OR UPDATE OF participant_id, queue_status
ON public.draw_entries
FOR EACH ROW
EXECUTE FUNCTION private.enforce_draw_entry_ic_region_eligibility();

-- Retire only invalid entries from active draw pools. The attendance and
-- participant rows are untouched; draw entry rows are retained as an audit
-- trail and marked skipped so they cannot be queued or selected.
UPDATE public.draw_entries AS e
SET queue_status = 'skipped',
    queue_position = NULL
FROM public.draw_rounds AS r,
     public.participants AS p
WHERE e.draw_round_id = r.id
  AND e.participant_id = p.id
  AND r.status IN ('ready', 'drawing')
  AND COALESCE((SELECT ds.payload #>> '{ic_region_rule,enabled}'
                FROM public.display_state AS ds WHERE ds.id = 1), 'false') = 'true'
  AND NOT (
    (btrim(COALESCE(p.ic_number, '')) ~ '^[0-9]{6}-[0-9]{2}-[0-9]{4}$'
      OR btrim(COALESCE(p.ic_number, '')) ~ '^[0-9]{12}$')
    AND substring(replace(btrim(COALESCE(p.ic_number, '')), '-', '') FROM 7 FOR 2)
      = ANY (
        ARRAY(
          SELECT jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof((SELECT ds.payload #> '{ic_region_rule,allowed_codes}'
                                 FROM public.display_state AS ds WHERE ds.id = 1)) = 'array'
                THEN (SELECT ds.payload #> '{ic_region_rule,allowed_codes}'
                      FROM public.display_state AS ds WHERE ds.id = 1)
              ELSE '[]'::jsonb
            END
          )
        )
      )
  );

-- If an active pool has no eligible entries left, close that draw session.
-- All draw_entries and draw_winners rows remain preserved.
UPDATE public.draw_rounds AS r
SET status = 'completed',
    updated_at = now()
WHERE r.status IN ('ready', 'drawing')
  AND EXISTS (
    SELECT 1 FROM public.draw_entries AS e
    WHERE e.draw_round_id = r.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.draw_entries AS e
    JOIN public.participants AS p ON p.id = e.participant_id
    WHERE e.draw_round_id = r.id
      AND e.queue_status <> 'skipped'
      AND (
        COALESCE((SELECT ds.payload #>> '{ic_region_rule,enabled}'
                  FROM public.display_state AS ds WHERE ds.id = 1), 'false') <> 'true'
        OR (
          (btrim(COALESCE(p.ic_number, '')) ~ '^[0-9]{6}-[0-9]{2}-[0-9]{4}$'
            OR btrim(COALESCE(p.ic_number, '')) ~ '^[0-9]{12}$')
          AND substring(replace(btrim(COALESCE(p.ic_number, '')), '-', '') FROM 7 FOR 2)
            = ANY (
              ARRAY(
                SELECT jsonb_array_elements_text(
                  CASE
                    WHEN jsonb_typeof((SELECT ds.payload #> '{ic_region_rule,allowed_codes}'
                                       FROM public.display_state AS ds WHERE ds.id = 1)) = 'array'
                      THEN (SELECT ds.payload #> '{ic_region_rule,allowed_codes}'
                            FROM public.display_state AS ds WHERE ds.id = 1)
                    ELSE '[]'::jsonb
                  END
                )
              )
            )
        )
      )
  );
