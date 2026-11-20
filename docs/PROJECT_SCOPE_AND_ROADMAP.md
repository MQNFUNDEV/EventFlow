# EventFlow — Current Scope & Development Roadmap

**Last updated:** 2026-11-20 (Malaysia time)  
**Repository:** https://github.com/MQNFUNDEV/Maqna-Eventflow  
**Current main commit:** `d25fccda8d2f4e3fa9ff36c3d3dcd07b34f2f971`

> **Agent coordination notice — read before making further changes.** The human owner has confirmed the revised scope below. Gemini is currently working on Phase 3. Preserve Gemini's in-progress work and branch; do not overwrite, reset, or rebase another agent's uncommitted work. This file and the matching GitHub issue are the current source of truth.

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
**IN PROGRESS — Gemini is currently working on this phase. Preserve its current work.**

- [ ] Add a `blackout` scene option to `LedDisplayControl.tsx` and `LedDisplayOutput.tsx`.
- [ ] Ensure LED output automatically applies configured theme colors, welcome poster, and scene backgrounds (Realtime / change detection as appropriate).
- [ ] Validate operator control and display synchronization.

**Removed from Phase 3:** QR/manual registration URL, walk-in QR generation, SAMPLE QR replacement, participant QR display. Do not implement these.

### Phase 4 — Supabase security & database hardening
**PENDING.**

- [ ] Enable Supabase leaked-password protection.
- [ ] Consolidate duplicate permissive RLS policies after inspecting the exact effective policies and preserving intended access.
- [ ] Add the three missing foreign-key indexes: `development_log_entries.created_by`, `development_log_sessions.created_by`, `participant_invitations.updated_by`.
- [ ] Rotate/revoke any Supabase secret key exposed in historical Git commits; removing a file from the latest tree does not remove it from Git history.
- [ ] Review and retire deprecated invitation / guest-pass code and deployed functions safely.
- [ ] Preserve production records; no reset or cleanup of test data without explicit owner approval and a verified backup.

### Phase 5 — Operator workflow testing
**PENDING.** No public-domain, email, QR, or desktop-package testing.

- [ ] Verify staff sign-in, session handling, and role-based access for Super Admin, Event Admin, and Front Desk.
- [ ] Test participant create/import/edit/search workflows.
- [ ] Test manual check-in and attendance status updates.
- [ ] Test LED control, blackout, settings application, and multi-screen synchronization.
- [ ] Test Lucky Draw setup, eligibility, drawing, winner records, and display synchronization.
- [ ] Run regression checks and `npm run lint` / `npm run build` after changes.

### Phase 6 — Pre-event readiness
**PENDING.**

- [ ] Review test data and event configuration with the owner.
- [ ] Back up and obtain explicit approval before deleting/resetting any participant, attendance, or Lucky Draw records.
- [ ] Confirm final event settings and participant data.
- [ ] Run an operator-only event-day smoke test.

## Agent coordination / change safety

1. Human owner is the final authority and Super Admin.
2. Gemini is currently the Phase 3 implementer. Continue from its existing working branch and preserve all uncommitted/in-progress changes.
3. Other agents must read this roadmap and the current GitHub issue before coding.
4. Do not make conflicting edits to Gemini-owned Phase 3 files while Gemini is actively changing them. Coordinate by reporting the branch/commit and file list first.
5. Use dedicated branches and pull requests; do not push directly to `main` for feature work.
6. Do not reset, force-push, deploy functions, apply migrations, or delete production data without reconciliation and explicit owner approval.
7. Keep GitHub, production Supabase, and Hive Mind status synchronized after each meaningful milestone.

## Current known production notes

- Supabase project: `MaqnaEventFlow` (`wypjyzpiunkrrpodylpo`), Singapore region, currently `ACTIVE_HEALTHY`.
- Edge Functions and JWT settings are listed under Phase 2 above.
- Security Advisor previously reported leaked-password protection disabled. RLS duplicate-policy and missing-index findings remain Phase 4 work.
- Existing test-data counts were previously observed; treat them as live production data, not disposable fixtures.
