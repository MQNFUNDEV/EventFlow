# Hive Mind Integration

**Status:** Initial runtime bridge deployed; frontend integration committed; authenticated production acceptance is pending.

## Components

- EventFlow frontend panel: `src/components/HiveMindPanel.tsx`, rendered on Overview in `src/App.tsx`.
- Hive Mind server-side bridge: `https://ulbkkjgbmvjxqbqurtux.supabase.co/functions/v1/eventflow-bridge`.
- Hive Mind project key: `eventflow-attendance`.
- Canonical EventFlow repository: https://github.com/MQNFUNDEV/EventFlow.

## Authentication and authorization

The browser sends the current EventFlow Supabase access token to the Hive Mind bridge. The bridge validates the token against EventFlow Auth and reads the caller's own `admin_roles` row using the caller's JWT and EventFlow RLS.

- `super_admin`, `event_admin`: aggregate status read and project-update submission.
- `front_desk`: aggregate participant and attendance status read only.
- No Hive Mind token or service-role key is sent to the browser.
- EventFlow role checks remain independent from Hive Mind agent credentials.
- The bridge does not grant access to EventFlow tables or bypass EventFlow RLS.

## API actions

All requests are POST JSON with `Authorization: Bearer <EventFlow access token>`.

### Read aggregate status

```json
{ "action": "status" }
```

Returns aggregate counts only:
- Participant count.
- Attendance check-in count.
- For Super Admin/Event Admin only: active draw rounds and pending/collected/available queue counts.

No participant names, email addresses, phone numbers, or row-level records are returned. The bridge uses the caller's JWT for EventFlow PostgREST requests, so the EventFlow RLS policies remain in force.

### Submit a project update

```json
{
  "action": "submit-project-update",
  "update_type": "status",
  "title": "Short update title",
  "body": "Sanitised project update text"
}
```

Only Super Admin and Event Admin can submit. The record is inserted into Hive Mind as `needs-review`; it is not automatically published to agent briefings. Common secret patterns are blocked. Do not include participant PII or confidential event information.

## Operator UI

The EventFlow Overview contains a Hive Mind panel:
- Provides a manual connection check/refresh so no background request is made until an operator asks for it.
- Shows aggregate metrics and a refresh action.
- Shows the share-status action only to Super Admin and Event Admin.
- Makes clear that shared information is aggregate-only.
- Displays submission feedback; successful submission means queued for review, not published.

## Deployment and verification

- Hive Mind Supabase Edge Function `eventflow-bridge` is deployed and ACTIVE, version 2, with platform JWT verification disabled because the function performs its own EventFlow Auth validation.
- Custom authentication is mandatory for every non-preflight request.
- EventFlow main commit `3a8e2541aaea3353030ea1d445fdb7d377b38f10` passed CI run #150 and GitHub Pages deployment #72; the Overview panel is deployed.
- Authenticated production acceptance still needs a real EventFlow staff session. Verify each of the three roles, the front-desk restriction, aggregate counts, admin submission, and that the Hive Mind record remains `needs-review` until approved.

## Security limits and next improvements

- This is a narrow status and project-learning bridge, not an AI command executor.
- It cannot create/edit participants, check in attendees, execute draws, collect prizes, manage staff, or change EventFlow settings.
- Do not add mutation tools until each operation has its own server-side allowlist, explicit operator confirmation, idempotency, rate limiting, request correlation and audit trail.
- Any future AI-provider calls must be server-side and use separately managed provider credentials. The bridge does not itself call Claude, OpenAI, Gemini, or other model APIs.
