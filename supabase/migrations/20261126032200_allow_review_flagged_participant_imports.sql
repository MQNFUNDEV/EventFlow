-- Permit imported participant rows to be stored for administrator review.
-- Normal/manual registrations still require a valid 12-digit IC.
CREATE OR REPLACE FUNCTION public.enforce_participant_ic_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.ic_number IS DISTINCT FROM OLD.ic_number
     OR NEW.needs_review IS DISTINCT FROM OLD.needs_review THEN
    IF NOT COALESCE(NEW.needs_review, false)
       AND (
         NEW.ic_number IS NULL
         OR regexp_replace(NEW.ic_number, '[^0-9]', '', 'g') !~ '^[0-9]{12}$'
       ) THEN
      RAISE EXCEPTION 'A valid 12-digit IC number is required for participant registration'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS participants_require_ic_number ON public.participants;
CREATE TRIGGER participants_require_ic_number
BEFORE INSERT OR UPDATE OF ic_number, needs_review
ON public.participants
FOR EACH ROW
EXECUTE FUNCTION public.enforce_participant_ic_number();

-- Keep valid ICs unique for normal registrations. Review rows may retain
-- malformed or duplicate source data without blocking the rest of the upload.
DROP INDEX IF EXISTS public.participants_ic_number_unique;
CREATE UNIQUE INDEX participants_ic_number_unique
ON public.participants (
  regexp_replace(ic_number, '[^0-9]', '', 'g')
)
WHERE needs_review = false
  AND ic_number IS NOT NULL
  AND regexp_replace(ic_number, '[^0-9]', '', 'g') ~ '^[0-9]{12}$';
