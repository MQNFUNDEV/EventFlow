# EventFlow

EventFlow is a staff-only event operations dashboard built with React, TypeScript, Vite, and Supabase.

## Production deployment status

**The operator dashboard is not currently deployed to a public web host. There is no verified live dashboard URL yet.**

- The repository is the source of truth for application code: [Maqna-Eventflow](https://github.com/MQNFUNDEV/Maqna-Eventflow).
- Supabase is the backend for authentication, database, realtime features, and Edge Functions.
- The current GitHub Actions workflow runs dependency installation, audit reporting, linting, and a production build. It does **not** publish the frontend.
- The repository is private and GitHub Pages has not been configured. Do not use a guessed `github.io` URL or a localhost address as the production dashboard.

A hosted frontend is still required: Supabase provides the backend/API but the current project setup does not publish the built React frontend. GitHub Pages is available for private repositories on eligible paid GitHub plans; on GitHub Free, the source repository must be public. GitHub Pages sites are publicly reachable, so staff authentication must remain enforced by Supabase and the application. See [GitHub Pages availability](https://docs.github.com/en/pages/quickstart).

**Live dashboard:** Not deployed — URL pending hosting configuration and successful deployment verification.

## Technology

- React + TypeScript + Vite
- Supabase Auth, Postgres, Realtime, and Edge Functions
- GitHub Actions for CI validation

## Operator scope

EventFlow is an internal staff tool. It supports staff sign-in and role-based access, participant management, manual attendance check-in, LED display control, and Lucky Draw operations.

Public attendee registration, QR passes/scanning, invitation-email workflows, and public attendee portals are out of scope.

## Development and validation

CI currently runs:

- `npm ci`
- Full and non-optional npm audit reports
- `npm run lint`
- `npm run build`

A successful CI build verifies code quality and build output; it does not mean the frontend has been deployed.
