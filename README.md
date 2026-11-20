# EventFlow

EventFlow is a staff-only event operations dashboard built with React, TypeScript, Vite, and Supabase.

## Production hosting

- Frontend: https://mqnfundev.github.io/EventFlow/
- Hosting: GitHub Pages (public frontend).
- Backend: Supabase Auth, Postgres, Realtime, Storage, and Edge Functions.
- Staff access is enforced by Supabase authentication, application role checks, and database row-level security (RLS).

The frontend and its Supabase publishable key are public by design. Never place a Supabase secret key or legacy service-role key in frontend code, GitHub Pages artifacts, or any `VITE_*` variable.

## Deployment

GitHub Pages is configured to use **GitHub Actions**. The deployment workflow builds the app with the `/EventFlow/` Vite base path and deploys the `dist` directory.

The workflow supplies the Supabase project URL and public publishable key at build time. No repository Actions secret is required for the publishable key. The key is intended to be visible in the browser and is not an authorization mechanism; Supabase Auth, application role checks, and RLS must protect all staff data and operations.

## Technology

- React + TypeScript + Vite
- Supabase Auth, Postgres, Realtime, Storage, and Edge Functions
- GitHub Actions + GitHub Pages

## Operator scope

EventFlow is an internal staff tool for authenticated event staff. Its current operator scope includes participant management, manual attendance check-in, administrator management, event settings, LED display control, and Lucky Draw operations.

Public attendee registration, QR passes/scanning, invitation-email workflows, and public attendee portals are not part of the current release scope.

## Validation

The CI workflow runs dependency installation, npm audit reporting, ESLint, and a production build. A successful build alone does not prove that live operator workflows work; authenticated end-to-end testing against a safe test environment is still required.
