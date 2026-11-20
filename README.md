# EventFlow

EventFlow is a staff-only event operations dashboard built with React, TypeScript, Vite, and Supabase.

## Hosting

- Frontend target: https://mqnfundev.github.io/EventFlow/
- Frontend hosting: GitHub Pages (public site).
- Backend: Supabase Auth, Postgres, Realtime, and Edge Functions.
- Staff access is enforced by Supabase authentication, application authorization, and database RLS. A public frontend does not make staff data or operations public.

The URL above is the intended permanent URL. It is not considered live until the GitHub Pages deployment succeeds and the site is verified.

## GitHub Pages setup

The repository owner must enable GitHub Pages with **Settings → Pages → Build and deployment → Source → GitHub Actions**.

The deployment workflow also requires these repository Actions variables:

- `VITE_SUPABASE_URL`: the Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: the Supabase publishable/anon key. This is a browser-visible public key; never put a service-role or secret key here.

The workflow builds the frontend with the `/EventFlow/` Vite base path and deploys the `dist` directory.

## Technology

- React + TypeScript + Vite
- Supabase Auth, Postgres, Realtime, and Edge Functions
- GitHub Actions for CI and Pages deployment

## Operator scope

EventFlow is an internal staff tool for authenticated staff. Its intended scope includes participant management, manual attendance check-in, LED display control, and Lucky Draw operations.

Public attendee registration, QR passes/scanning, invitation-email workflows, and public attendee portals are out of scope.

## Validation

The CI workflow runs dependency installation, npm audit reporting, ESLint, and a production build. A successful build alone does not prove that the deployed application or live operator workflows work; those require deployment and authenticated end-to-end tests.
