# EventFlow — Product Scope & Production Readiness

**Last updated:** 2026-11-21 (Malaysia time)  
**Repository:** https://github.com/MQNFUNDEV/EventFlow  
**Production web app:** https://mqnfundev.github.io/EventFlow/  
**Current application version:** 1.3.1  
**Production baseline:** `main` at `ab313606025c2ad65bc1cf616c031c0915a077af`

> This document supersedes earlier roadmap status where it conflicts with the current repository, deployment, or owner-approved scope. Treat the production database as live. Do not perform destructive data operations, schema changes, migrations, or Edge Function deployments without inspection, a recovery plan, and the required owner approval.

## 1. Product scope

EventFlow is an internal operator system for Maqna Momento staff. The operator web application is hosted on GitHub Pages and uses Supabase as its shared backend. GitHub Pages hosting is in scope; a public attendee registration product is not.

### In scope

- Staff sign-in and Supabase authentication.
- Role-based access: Super Admin, Event Admin and Front Desk.
- Participant management and import.
- Manual attendance check-in (not QR-based).
- Operator overview and event settings.
- LED display control/output, blackout, scenes, artwork and synchronization.
- Lucky Draw management, winner records and display synchronization.
- Admin Management, Development Log, security and database integrity.
- A lightweight, consistent operator interface.

### Explicitly out of scope

- Public attendee registration or attendee-facing account portal.
- QR passes, QR generation, QR scanning or QR-based check-in.
- Bulk invitation email delivery, Resend setup or email-provider procurement.
- Windows EXE / Tauri packaging for the current delivery scope.
- Unrequested feature expansion that increases operational complexity.

The legacy invitation table and QR-token column remain in the database for data preservation. The `guest-pass` and `send-invitations` Edge Functions are retired 410 handlers with JWT verification enabled; do not reactivate them.

## 2. Confirmed delivery snapshot

### GitHub and deployment

- PR #20 merged: operator settings/dashboard cleanup and related workflow improvements.
- PR #21 merged: duplicate operator page headings and role-access banners removed from affected pages.
- Latest `main` commit: `ce0f6b7f9fe857da8c995dc9c5002d1441897e59`.
- Latest CI run for that commit succeeded: lint, dependency security gate and production build.
- GitHub Pages deployment for the commit succeeded (workflow run `44764384279`).
- Production URL: https://mqnfundev.github.io/EventFlow/

### Confirmed application changes

- Removed the global Add Participant action from unrelated modules.
- LED display controls were consolidated and made more compact.
- LED settings and event information use separate save paths.
- Lucky Draw current-session winners are filtered by draw round; reset preserves historical winner records.
- The Lucky Draw animation prototype received a transparent acrylic hopper, a denser paper pile and additional glass/lever styling. Its animation remains a presentation prototype and is not wired to select or confirm real winners.
- PR #28 adds in-flight guards to prevent rapid duplicate Spin clicks and simultaneous Confirm/Skip actions within the same operator page instance. CI passed and the change was deployed. This is not a database-level lock against multiple browsers/operators.
- Duplicate inner headings and redundant access banners were removed from Settings, LED Display, Admin Management, Attendance and Development Log.
- Relevant refresh/export controls were retained.

These are implementation and CI/deployment confirmations. They do not constitute end-to-end testing of every operator workflow.

### Supabase production snapshot (read-only inspection, 2026-11-21)

- Project `MaqnaEventFlow` is `ACTIVE_HEALTHY`, region Singapore.
- All 14 public tables returned by the table inspection have RLS enabled.
- Current Edge Functions: `admin-management` v10, `guest-pass` v5 and `send-invitations` v6; all have `verify_jwt: true`.
- The two retired functions remain active deployments only as protected 410 handlers.
- Supabase Security Advisor reports leaked-password protection disabled. This is unavailable on the current Free plan; retain the compensating password and account controls. Do not upgrade solely for this feature without an owner decision.
- Performance Advisor reports 22 unused-index notices and two multiple-permissive-policy notices. The latter relate to intentionally different role-specific access paths on `admin_roles` SELECT and `participants` INSERT. Do not remove indexes or combine policies without usage and authorization analysis.
- A read-only Lucky Draw inspection found 14 active prize categories: the shared `Lucky Draw` category is linked to 18 rounds, while 13 historical session-specific categories each retain one round. Preserve these historical records; do not bulk-delete or deactivate them without owner review.
- No production rows were deleted or modified during this inspection.

### Migration-history caution

Production currently records nine migrations. The production migration version for configurable participant categories is `20261120174100`, while the repository filename is `20261121010000_allow_configurable_participant_categories.sql`. Earlier migration filenames also have historical timestamp differences. Reconcile the exact SQL and production schema before any future migration operation. Never repair migration history by guessing, resetting, or blindly pushing migrations.

## 3. Production-readiness phases

The phases below are the active delivery plan. A source-code review or successful build must never be reported as a passed live workflow test.

### Phase 1 — Visual presentation audit

**Status: PARTIALLY COMPLETE**

- [x] Remove duplicate headings and redundant access banners from the affected pages.
- [x] Remove the global Add Participant action from unrelated modules.
- [x] Consolidate LED display controls and settings navigation.
- [ ] Review every operator page for spacing, typography, hierarchy, alignment, empty states and consistent controls.
- [ ] Review desktop, laptop and narrow-screen layouts.
- [ ] Verify that every visible action is relevant to its current module.
- [ ] Perform a live visual review of Overview, Participants, Attendance, Lucky Draw, LED Display, Settings, Admin Management and Development Log.

**Pass condition:** All operator pages look coherent and finished, with no duplicate UI, dead controls or visibly unfinished sections.

### Phase 2 — Operator workflow verification

**Status: IMPLEMENTED FEATURES; LIVE ROLE-BASED TESTING PENDING**

- [ ] Super Admin sign-in, session refresh and sign-out.
- [ ] Event Admin permissions and restricted-page access.
- [ ] Front Desk permissions and restricted-page access.
- [ ] Participant create, edit, search, import and active/inactive handling.
- [ ] Manual check-in, duplicate check-in handling and attendance export.
- [ ] Event settings save/reload and LED settings save/reload independently.
- [ ] Admin creation, role assignment, reset/recovery and deactivation.
- [ ] Development Log session start, pause, resume, end and entry editing.
- [ ] Verify loading, empty, success and error states for each workflow.

### Phase 3 — Lucky Draw reliability and scale

**Status: IMPLEMENTED BASELINE; DEEP VALIDATION PENDING**

- [ ] Verify checked-in eligibility for every configured participant category.
- [ ] Verify round creation, pool loading, winner selection and duplicate prevention.
- [ ] Verify winner collection/skipping and historical session preservation.
- [ ] Review reset consistency, including partial-failure recovery and prize-category accumulation.
- [ ] Review large-pool insertion strategy and API/body limits for 5,000 attendees.
- [ ] Test repeated draws, operator double-clicks and concurrent operator actions.
- [ ] Test connection loss/recovery during pool loading and winner confirmation.
- [ ] Verify LED winner announcement synchronization.
- [ ] Keep the Lucky Draw machine animation clearly identified as a visual prototype until its draw action is wired to the real draw workflow.

**Safety note:** Current production Lucky Draw records are live. Do not reset, delete, or use production records as test fixtures. Use a dedicated safe test environment or carefully approved test records.

### Phase 4 — Security and administrator control

**Status: BASELINE HARDENING APPLIED; AUTHORIZATION TESTS PENDING**

- [x] Rotate the exposed historical Supabase secret key; the old key was revoked/deleted and the replacement key reference is in use.
- [x] Keep service-role/secret keys out of frontend code.
- [x] Keep all public tables protected by RLS.
- [x] Keep retired Edge Functions protected by JWT verification.
- [ ] Test every role against both allowed and denied actions.
- [ ] Review RLS policies and Edge Function authorization against the intended role matrix.
- [ ] Verify account deactivation, session expiry and recovery behaviour.
- [ ] Re-run Supabase security and performance advisors after any approved database change.
- [ ] Keep leaked-password protection disabled as a documented Free-plan limitation unless the owner chooses a plan change.

### Phase 5 — Performance and stability

**Status: NOT YET VALIDATED UNDER EVENT LOAD**

- [ ] Review production bundle size and asset weight.
- [ ] Review repeated/polling database requests and realtime fallback behaviour.
- [ ] Test 5,000-participant search, import and attendance workflows.
- [ ] Test repeated check-ins and concurrent operators.
- [ ] Test LED output over a long session and after reconnect.
- [ ] Inspect browser console/network failures and memory growth.
- [ ] Review npm audit findings, including optional native/canvas dependencies, without breaking the Lucky Draw visual experience.
- [ ] Establish measurable performance acceptance criteria before optimizing.

### Phase 6 — Full event simulation

**Status: BLOCKED ON OWNER/OPERATOR PARTICIPATION**

- [ ] Use a safe test event/data set.
- [ ] Rehearse all three roles.
- [ ] Run participant import and check-in at realistic volume.
- [ ] Operate the LED controller and a separate display device together.
- [ ] Run multiple Lucky Draw rounds and verify results.
- [ ] Simulate internet interruption and recovery.
- [ ] Record evidence and defects; fix and repeat failed scenarios.

### Phase 7 — Release preparation

**Status: DEPLOYMENT ACTIVE; RELEASE SIGN-OFF PENDING**

- [x] Production GitHub Pages deployment is active.
- [x] CI passes for the current production baseline.
- [ ] Complete Phases 1–6 acceptance checks.
- [ ] Confirm production event configuration and data with the owner.
- [ ] Prepare concise operator instructions and recovery steps.
- [ ] Record final version and release notes.
- [ ] Obtain owner sign-off before calling the system event-ready.

## 4. Owner attention required

The owner/operator is needed only for checks that require their live accounts, devices, decisions or physical setup:

1. **Live role testing:** provide/operate the Super Admin, Event Admin and Front Desk accounts so access and workflows can be verified. Never share passwords in chat.
2. **Visual acceptance:** inspect the live pages on the actual operator laptop and report only visible issues or preferences.
3. **LED rehearsal:** use the operator computer and a separate LED/output screen to verify scene changes, blackout and reconnect behaviour.
4. **Lucky Draw acceptance:** confirm the intended category/prize/round workflow and observe a safe test draw. Do not use live production records for destructive testing.
5. **Event sign-off:** confirm final event details, participant data and readiness to run the rehearsal.

No owner action is needed for ordinary code inspection, static analysis, documentation maintenance, CI checks or preparing safe test plans.

## 5. Change-control rules

1. Use a dedicated branch and pull request for code changes; do not push feature work directly to `main`.
2. Inspect current `main`, production Supabase and migration history before backend work.
3. Never reset, force-push, deploy Edge Functions, apply migrations or delete production records without a recovery plan and required approval.
4. Treat production participants, attendance, draw entries, winners and rounds as real records—not disposable fixtures.
5. Keep GitHub, deployed frontend and Supabase status clearly distinguished: committed, merged, deployed and functionally verified are different states.
6. Prefer small, testable changes. Avoid feature expansion and unnecessary dependencies.
