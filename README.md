# EventFlow

EventFlow is a staff-only event operations dashboard built with React, TypeScript, Vite, and Supabase.

## Production deployment

**Hosting target:** https://mqnfundev.github.io/EventFlow/

The target URL is not considered live until the GitHub Pages deployment succeeds and the deployed app is verified.

- **Frontend:** GitHub Pages (public static assets).
- **Backend:** Supabase Auth, Postgres, Realtime, Storage, and Edge Functions.
- **Access control:** Supabase Auth, administrator-role checks, and database Row Level Security (RLS).
- **Source repository:** https://github.com/MQNFUNDEV/EventFlow

The frontend is publicly downloadable. Never place Supabase service-role keys, secret API keys, database passwords, or other privileged credentials in frontend code or Vite environment variables. Only the Supabase project URL and a publishable/legacy anon key may be included in the browser build.

### GitHub Actions configuration

The Pages deployment workflow expects these repository Actions variables (Settings → Secrets and variables → Actions → Variables):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (the Supabase publishable key; safe for browser use, never substitute a service-role/secret key)

These are public client configuration values, not privileged secrets. The workflow reads them as Actions variables so no privileged credential is needed for the frontend build.

GitHub Pages must be enabled with **GitHub Actions** as the build and deployment source. Supabase Auth must allow the deployed site URL as a redirect URL.

## Operator scope

EventFlow is an internal staff tool. It supports staff sign-in and role-based access, participant management, manual attendance check-in, LED display control, and Lucky Draw operations.

Public attendee registration, QR passes/scanning, invitation-email workflows, and public attendee portals are out of scope.

## Development and validation

CI runs:

- `npm ci`
- Full and non-optional npm audit reports
- `npm run lint`
- `npm run build`

A successful CI build validates the source; it does not, by itself, prove that GitHub Pages is deployed or that production authentication and operator workflows work.
