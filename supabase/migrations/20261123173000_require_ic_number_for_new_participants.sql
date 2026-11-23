-- Reject new participant registrations without a valid 12-digit IC.
-- Existing legacy rows with NULL IC remain untouched; editing other fields on
-- those rows remains possible until their IC is backfilled.
CREATE OR REPLACE FUNCTION public.enforce_participant_ic_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.ic_number IS DISTINCT FROM OLD.ic_number THEN
    IF NEW.ic_number IS NULL
       OR regexp_replace(NEW.ic_number, '[^0-9]', '', 'g') !~ '^[0-9]{12}$' THEN
      RAISE EXCEPTION 'A valid 12-digit IC number is required for participant registration'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participants_require_ic_number ON public.participants;
CREATE TRIGGER participants_require_ic_number
BEFORE INSERT OR UPDATE OF ic_number
ON public.participants
FOR EACH ROW
EXECUTE FUNCTION public.enforce_participant_ic_number();
