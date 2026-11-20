# EventFlow — Current Scope & Development Roadmap

**Last updated:** 2026-11-20 (Malaysia time)  
**Repository:** https://github.com/MQNFUNDEV/Maqna-Eventflow  
**Phase 1 merge commit:** `d25fccda8d2f4e3fa9ff36c3d3dcd07b34f2f971`

> **Agent coordination notice — read before making further changes.** The human owner has confirmed the revised internal-operator scope below. Gemini has stopped work. Its original Phase 3 branch and commit are preserved; the approved operator-only implementation was integrated through PR #6 and the Attendance QR-scanner scope correction was merged through PR #7. Do not reintroduce the cancelled QR/public-registration scope. This file and the matching GitHub issue are the current source of truth.

## Product scope (confirmed by owner)

EventFlow is an **internal operator system for staff only**. Operators use the existing web application with Supabase as the shared backend. It is not an attendee-facing product.

### Explicitly out of scope — do not build or spend time on these

- Public attendee-facing website or public registration portal.
- Individual participant QR passes, QR generation, QR scanning, or QR-based check-in.
- Bulk participant invitation emails / mass email delivery (including 5,000-person sends), Resend setup, or other email-provider procurement.
- Vercel, Cloudflare Pages, GitHub Pages, or other public frontend hosting.
- Standalone Windows EXE / Tauri desktop packaging.

Do not reintroduce these tasks from earlier roadmap versions. The `guest-pass` and `send-invitations` Edge Functions remain deployed at present but are deprecated/out of active scope; do not invoke or expand them. Remove them only in a separately reviewed cleanup after checking all code references and deployment dependencies.

### In scope — preserve and complete

- Private staff sign-in and Supabase authentication.
- Role-based access and Admin Management (Super Admin, Event Admin, Front Desk).
- Participant records and participant management.
- **Manual attendance check-in** (no QR).
- Operator dashboard and event settings.
- LED display control/output, including blackout and automatic application of configured display settings.
- Lucky Draw management, results, and display synchronization.
- Security, database integrity, and functional testing for the operator workflows.

## Delivery status

### Phase 1 — Repository sync & critical code cleanup
**COMPLETE.** PR #3 merged into `main` as `d25fccda8d2f4e3fa9ff36c3d3dcd07b34f2f971`.

- [x] Removed tracked temporary/backup files: `New Text Document.txt`, `src/App.backup-before-admin.ps1.txt`; `src/App.before-role-access.tsx` had already been removed.
- [x] Fixed encoding glitches in `AdminManagement.tsx` and `AuthGate.tsx`.
- [x] Removed inactive Search, Event Year, and topbar avatar controls; retained working sidebar sign-out.
- [x] Added GitHub Actions CI for `npm ci`, `npm run lint`, and `npm run build`.
- [x] GitHub Actions run #2 passed all three checks.

### Phase 2 — Deployment / Supabase setup
**COMPLETE UNDER THE REVISED INTERNAL-ONLY SCOPE.** No public frontend deployment is required.

- [x] Supabase project is active and remains the shared backend.
- [x] Staff authentication remains in scope.
- [x] Existing Edge Functions inspected: `admin-management` v3 active (`verify_jwt: true`), `send-invitations` v2 active (`verify_jwt: true`), `guest-pass` v1 active (`verify_jwt: false`).
- [x] No Vercel/Cloudflare/public URL setup required.
- [x] No Resend/API key/sender setup or mass-email work required.
- [x] No public attendee URL or QR-pass deployment required.
- [ ] Later cleanup: review and retire deprecated `guest-pass` and `send-invitations` functions only after code-reference/dependency review. Do not block current operator work on this cleanup.

### Phase 3 — LED / on-stage operator features
**IMPLEMENTATION AND QR-SCOPE CLEANUP MERGED; automated CI passed. Live LED smoke test remains pending.** PR #6 merged into `main` as `4eba170a51fbeeafbbc4d192902640a9f144e8f0`; Attendance QR-scanner removal merged through PR #7 as `57d833d78a0c027de92206549f9ab7cd3bf38173`.

- [x] Blackout scene control and pure-black output stage.
- [x] Automatic application of theme colors, welcome artwork/backgrounds, and scene backgrounds.
- [x] Realtime subscriptions for LED control and output, with a 3-second polling fallback on the LED output.
- [x] `assets_updated_at` cache-version updates when welcome artwork and scene backgrounds are uploaded.
- [x] Remove walk-in registration URL, QR generation/display, and QR-specific UI from the Phase 3 implementation.
- [x] Keep Manual Check-in as a non-QR informational display for the staffed check-in desk.
- [x] Remove the camera-based QR scanner and QR-token lookup from the Attendance page; rename the Overview action to Manual Check-in.
- [x] Make all new Attendance-page check-ins explicitly use `check_in_method = 'manual'`.
- [x] Change the database default for `attendance.check_in_method` to `manual` via migration `20261120051204_set_manual_attendance_default`; historical QR values are retained unchanged.
- [x] Align the migration file to the production-applied version `20261120031308`; production migration history confirms this version is already applied.
- [x] GitHub Actions run #11 passed `npm ci`, `npm run lint`, and `npm run build` on the Phase 3 branch before PR #6 merged.
- [x] PR #7 CI run #18 passed `npm ci`, `npm run lint`, and `npm run build` before merge.
- [ ] Perform a live two-screen smoke test: change LED scene from the operator control, verify output follows, enable blackout, then update theme/artwork/background settings and verify they apply without a browser refresh.

Superseded Gemini PR #4 was closed without merging. Its branch `gemini/phase-3-onstage-features` and original commit `5079bca38ca01530a001b640f8797a98d8bf767a` were preserved. Duplicate PR #5 was also closed without merging. The corrected implementation is in PR #6 and the Attendance scope correction is in PR #7.

**Removed from Phase 3:** walk-in registration URL, QR generation/display, QR-based registration/check-in. Do not reintroduce these.

### Phase 4 — Supabase security & database hardening
**PARTIALLY COMPLETE — production changes applied and verified; owner follow-up remains.**

- [ ] Enable Supabase leaked-password protection. Still disabled in Auth Security Advisor; the connected Supabase tools do not expose this Auth setting.
- [x] Remove four exactly redundant SELECT policies from `draw_entries`, `draw_rounds`, `prize_categories`, and `push_subscriptions`. Their equivalent `ALL` policies retain the same authenticated admin predicate.
- [x] Preserve non-duplicate policies on `admin_roles` (self-or-superadmin SELECT is broader than superadmin-only ALL) and `participants` (admin and front-desk INSERT predicates intentionally differ).
- [x] Add and verify indexes for `development_log_entries.created_by`, `development_log_sessions.created_by`, and `participant_invitations.updated_by`.
- [ ] Rotate/revoke the Supabase secret key exposed in historical Git commits; removing a file from the latest tree does not invalidate it. Rotation requires an owner action in Supabase settings.
- [ ] Review and retire deprecated invitation / guest-pass code and deployed functions safely.
- [ ] Re-run role-based access tests after RLS changes.

Production migrations applied:
- `20261120033919_add_missing_foreign_key_indexes`
- `20261120033944_remove_redundant_select_policies`
- `20261120051204_set_manual_attendance_default`

Matching migration files are committed to `main`. No participant, attendance, event, or Lucky Draw records were deleted or reset. Work proceeded without a production backup at the owner's direction; destructive data cleanup remains prohibited.

### Phase 5 — Operator workflow testing
**PENDING — no end-to-end operator workflow tests have been completed yet.** No public-domain, email, QR, or desktop-package testing.

- [ ] Verify staff sign-in, session handling, and role-based access for Super Admin, Event Admin, and Front Desk.
- [ ] Test participant create/import/edit/search workflows.
- [ ] Test manual check-in and attendance status updates.
- [ ] Test LED control, blackout, settings application, and multi-screen synchronization.
- [ ] Test Lucky Draw setup, eligibility, drawing, winner records, and display synchronization.
- [ ] Run regression checks and `npm run lint` / `npm run build` after changes.
- [ ] Record test evidence for each role and operator workflow; a lint/build pass alone does not count as functional verification.

### Phase 6 — Pre-event readiness
**PENDING.**

- [ ] Review test data and event configuration with the owner.
- [ ] Back up and obtain explicit approval before deleting/resetting any participant, attendance, or Lucky Draw records.
- [ ] Confirm final event settings and participant data.
- [ ] Run an operator-only event-day smoke test.

## Agent coordination / change safety

1. Human owner is the final authority and Super Admin.
2. Gemini has stopped work. Its original Phase 3 branch and commit remain preserved for audit; the accepted Phase 3 implementation is merged through PR #6 and #7. Do not restart or overwrite Gemini's branch.
3. Other agents must read this roadmap and the current GitHub issue before coding.
4. Gemini is no longer actively changing Phase 3 files. Any further changes must use a dedicated branch and pull request, with the human owner remaining the final authority.
5. Use dedicated branches and pull requests; do not push directly to `main` for feature work.
6. Do not reset, force-push, deploy functions, apply migrations, or delete production data without reconciliation and explicit owner approval.
7. Keep GitHub, production Supabase, and Hive Mind status synchronized after each meaningful milestone.

## Current known production notes

- Supabase project: `MaqnaEventFlow` (`wypjyzpiunkrrpodylpo`), Singapore region, currently `ACTIVE_HEALTHY`.
- Edge Functions and JWT settings are listed under Phase 2 above.
- Security Advisor still reports leaked-password protection disabled. The four redundant SELECT-policy warnings were reduced; two remaining warnings are intentional role-specific policies. The three missing-FK-index findings were addressed. The 22 unused-index notices are informational and must not be cleaned up without usage review.
- The owner confirmed the Free plan has no project backups and directed work to proceed without one. Treat production changes as elevated risk; no destructive data cleanup or reset.
- Existing test-data counts were previously observed; treat them as live production data, not disposable fixtures.
