-- Make the IC number the sole participant identity key.
-- Normalise punctuation/spaces so 900101-14-5678 and 900101145678 are identical.
-- Legacy records with no IC remain intact; all new UI registrations/imports require a valid IC.
DROP INDEX IF EXISTS public.participants_name_phone_unique;
DROP INDEX IF EXISTS public.participants_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS participants_ic_number_unique
ON public.participants (
  regexp_replace(ic_number, '[^0-9]', '', 'g')
)
WHERE ic_number IS NOT NULL
  AND regexp_replace(ic_number, '[^0-9]', '', 'g') <> '';
