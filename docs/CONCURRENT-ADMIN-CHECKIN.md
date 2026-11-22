# Concurrent admin check-in operations

EventFlow supports multiple separately signed-in administrators and Front Desk users working against the same Supabase database at the same time. Attendance and participant registration are shared event data; the LED display controller lease is a separate, exclusive control and does not lock check-in work.

## Role permissions

- **Super Admin:** read participants and attendance; add, edit, deactivate/reactivate participants; record check-ins.
- **Event Admin:** same participant and attendance operations as Super Admin, subject to existing settings/admin-management restrictions.
- **Front Desk:** read the participant directory and attendance; add participants and import CSV; record check-ins. Front Desk cannot edit or deactivate existing participants.
- All three roles can use the category filter to focus on their assigned group.

Category filtering is an operator workflow, not a per-admin data-isolation boundary. Each authorised operator can see the shared event directory. If strict assignment (each admin sees only explicitly assigned categories) is ever required, implement an admin-to-category assignment table and enforce it in RLS; do not rely on hiding categories in the UI.

## Concurrent writes and duplicate protection

Database constraints, not browser-side checks, are the final authority:

- Participant codes are unique.
- Participant email is unique case-insensitively after trimming, when supplied.
- The normalized full-name plus phone pair is unique when a phone number is supplied. Phone numbers may be shared by different family members, so phone alone is not unique.
- Participant ID is the attendance table's primary key. A participant can only have one attendance record.
- Attendance inserts record the authenticated user in checked_in_by; RLS requires that it matches auth.uid().

A second simultaneous check-in for the same participant receives a unique-key conflict and is shown as already checked in. Simultaneous duplicate participant submissions are rejected by the database indexes even if the two browser clients had stale directory data.

When both email and phone are absent, there is no reliable unique identity key; operators should search the name before adding a guest. Do not invent a uniqueness rule on name alone.

## Live updates

The participants and attendance tables are included in the supabase_realtime publication. The Participant Directory refreshes when participant rows change. The Attendance screen refreshes when participant or attendance rows change. RLS remains enabled and continues to determine which rows each authenticated user can read.

Manual Refresh remains available as a recovery action.

## Acceptance checklist

Run these checks with two different authenticated admin accounts and, separately, a Front Desk account:

1. Keep both admin Attendance screens open. Add a guest from one account and confirm the other screen receives the new guest without manual refresh.
2. Record a check-in from one account and confirm the other screen shows the guest as checked in.
3. Attempt the same participant check-in from both accounts at nearly the same time; only one attendance row must exist.
4. Add the same email from both accounts; only one participant record must exist.
5. Add the same name and phone combination from both accounts; only one participant record must exist.
6. Add two different family members with the same phone but different names; both should be accepted.
7. Sign in as Front Desk; confirm Add Participant, CSV import, and Check in work, while Edit and Deactivate remain unavailable.
8. Confirm the LED display controller lock still permits only one controller while check-in remains available to other admins.

A successful build and deployment does not replace this real multi-account acceptance test.
