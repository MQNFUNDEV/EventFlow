# Guest spreadsheet data patterns and import rules

**Observed source:** owner-provided guest roster pasted on 2026-11-26. The source contains roughly 2,972 physical text lines including its header. This is a pattern reference only; do not copy guest names, ICs, phone numbers, email addresses, or raw roster rows into Hive Mind.

## Observed table shape

The main table uses six columns:

1. `NAMA` — guest's name
2. `KAD PENGENALAN` — Malaysian identity-card number (IC/MyKad)
3. `NOMBOR TELEFON` — phone/mobile contact
4. `EMEL` — email address or sometimes more than one address
5. `IPT` — higher-education institution (university/college)
6. `Category` — participant category; the sample uses `Mahasiswa`

The source includes records from many institutions and campus labels, including UKM, USIM, UPNM, UPSI, UIA, UM, UMT, UMK, UUM, UniMAP, UTeM, UMPSA, USAS, UiTM campus labels, Puncak Alam and Puncak Perdana. Preserve the supplied institution text. Do not infer or overwrite an institution from an email domain.

## Data variation observed

### Names
- Uppercase, lowercase, and title case are mixed.
- Extra spaces and trailing spaces occur.
- Malay name particles and abbreviations vary: `BIN`, `BINTI`, `BT`, `BT.`, `MD`, `MOHD`, `MUHD`, `MOHAMAD`, `MUHAMMAD`.
- Other name forms occur, including `A/P`, `A/L`, apostrophes, hyphens, and `@` alias/name forms.
- Some names are repeated, and spelling may vary between repeated rows.

**Rule:** trim outer whitespace for matching/display hygiene, but preserve the submitted spelling, order, punctuation, particles, and abbreviation. Never expand `BT` to `BINTI`, `MD` to `MOHD`, or otherwise guess a person's legal name. Do not merge records based on similar names alone.

### IC / identity number
- Values appear with and without hyphens/spaces.
- Some values have fewer than 12 digits; some are not an IC at all (for example, a student/matric code may have been placed in the IC column).
- Spreadsheet numeric formatting may remove leading zeroes.

**Rule:** remove presentation separators for a comparison key, but require exactly 12 digits for a valid Malaysian IC. Never pad or invent a missing digit. Keep an invalid supplied value in the review record and mark it for admin attention. Match existing guests only by a valid normalized IC; ambiguous/repeated matches must be reviewed, not silently merged.

### Phone
- Malaysian numbers appear with and without hyphens/spaces.
- Leading zeroes are significant; some values are incomplete or too short.
- Some entries may be formatted as numbers by spreadsheet software.

**Rule:** store phone numbers as text. Do not convert to a number, remove a leading zero, or reject the entire guest because the phone is incomplete. Keep the original supplied formatting where possible; flag only if the product has an explicit phone validation rule.

### Email
- Upper/lowercase varies.
- Some rows have two email addresses separated by a slash.
- Some addresses have spaces, malformed domains, incomplete values, or a very short value.
- Institutional and personal email addresses are mixed.

**Rule:** trim outer whitespace and preserve the full submitted value. Do not silently discard a second address, infer a corrected domain, or reject the whole guest because email is missing/invalid. If a future data model separates multiple email addresses, split only on clearly recognised separators and preserve the original in notes/audit data.

### Institution / IPT
- `IPT` is the institution field and should map to EventFlow's University field.
- Abbreviations and campus names are supplied as values.
- Similar institutions may have multiple labels.

**Rule:** map `IPT`, `Nama IPT`, `Universiti`, `University`, `Institution`, and equivalent headers to `university_name`. Do not also copy IPT into `organisation`. Preserve the original institution label unless an explicit, reviewed alias dictionary is introduced.

### Category
- The sample uses the Malay value `Mahasiswa`.
- EventFlow's current default student category is labelled `MEC STUDENT` with ID `student`; the source label therefore needs a safe legacy mapping.
- Future events may use additional categories.

**Rule:** match configured category IDs/names first. Map known student synonyms such as `Mahasiswa`, `Pelajar`, `Murid`, and `Student` to the configured `student` category when it exists. Map known staff synonyms to `staff` only when that configured category exists. Preserve exact matches for all custom categories. Unknown categories remain review-needed; never invent a new category during import. All authorised admins continue to see all categories.

### Incomplete and free-text details
- Some fields are blank while the rest of the guest row is useful.
- Some values are short fragments or short sentences rather than formal labels.
- A quoted email cell in the pasted text spans a physical newline, so physical line breaks do not always mean a new guest row.

**Rule:** retain a guest row when it contains participant data even if one or more fields are missing. Blank re-import cells must not erase existing database values. Preserve notes/remarks/description/catatan/butiran text verbatim after trimming outer whitespace. CSV parsing must respect quoted multiline cells. Do not split a row merely because a quoted value contains a newline.

## EventFlow import behaviour

- Recognise English and Malay header aliases, including `NAMA`, `KAD PENGENALAN`, `NOMBOR TELEFON`, `EMEL`, `IPT`, and `Category`, plus common short forms such as `IC`, `No. KP`, `HP`, `No. Tel`, `Matrik`, and `No. Pelajar`.
- `Mahasiswa` maps to the configured `student` category.
- Preserve name spelling/abbreviations, phone text, email text, institution labels, and free-text notes; do not auto-correct personal data.
- Do not pad 11-digit IC values. Keep them review-needed because the missing digit cannot be known safely.
- A valid, unique 12-digit IC can reconcile to an existing guest. Update only supplied non-empty fields; blank cells preserve stored values.
- New records with missing/invalid required details remain visible in Guest With Issues for operator review rather than disappearing.
- Repeated ICs and ambiguous existing matches remain visible for manual investigation; do not silently deduplicate.
- Spreadsheet re-import updates and import-generated review flags must not set the manual **REVISED** marker. The marker is reserved for a real manual guest edit saved by an admin. Import must not advance `updated_at` solely to mark an upload change.
- Do not include participant PII in Hive Mind learning entries, project updates, logs, or this reference.

## Current implementation note

The 2026-11-26 parser update adds Malay student-category recognition, additional header aliases for IC/student ID/phone/email/notes, separates IPT from organisation, stops inventing a missing leading IC digit, and prevents spreadsheet updates/review flags from advancing the manual-revision timestamp. The importer still needs a real-workbook acceptance test, including quoted multiline CSV, missing values, short forms, multiple emails, invalid ICs, and duplicate ICs.
