-- Prevent concurrent admins from creating the same participant identity.
-- Email is already unique (case-insensitive); this also protects records that
-- do not have an email address while allowing family members to share a phone.
CREATE UNIQUE INDEX participants_name_phone_unique
ON public.participants (
  lower(btrim(full_name)),
  regexp_replace(phone, '[^0-9]', '', 'g')
)
WHERE phone IS NOT NULL AND btrim(phone) <> '';
