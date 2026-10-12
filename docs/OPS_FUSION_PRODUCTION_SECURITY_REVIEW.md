# OpsFusion — production security and release review

Reviewed: 2026-10-13 (Philippines time). This document tracks verified production observations separately from unfinished tasks.

## Current operational evidence

- Production website: https://opsfusion-it.vercel.app/ — Vercel production state **READY** at review.
- `opsfusion-ai-assistant` Supabase Edge Function: ACTIVE, version 7, JWT verification enabled.
- A live authenticated request returned an actual Google Gemini AI analysis. The provider and model name were displayed honestly in the read-only Service Desk modal. The user explicitly approves inserting and separately saving a draft.
- The hourly `opsfusion-cloud-automation-hourly` job is active (`0 * * * *`). Recent scheduled runs finished, and there are no open automation alerts.
- The existing authentication accounts, workspace rows, tickets and audit records remained intact. No data purge, reset, credential rotation or test-user deletion is authorized.
- The automated test suite's last comprehensive execution had **111 passing checks**. This is simulated regression testing, not a substitute for a real browser and device/agent test.

## Non-destructive database performance remediation — applied

Supabase's database linter reported an unindexed foreign key:
`opsfusion_audit_events.actor_id`.

Source-controlled migration: `supabase/migrations/20261013_audit_actor_index.sql`.

The migration was successfully applied to the live Supabase project, adding the non-unique B-tree index:
`opsfusion_audit_actor_id_idx` on `public.opsfusion_audit_events(actor_id)`.

A subsequent linter run **no longer reported the missing-FK-index finding**. It temporarily reports the new index as "unused" (informational), which is expected until a suitable query benefits from it. Do not remove an index solely because its usage statistic is initially zero.

## Supabase Auth: outstanding account-level configuration

**Leaked-password protection: disabled (security warning).** In the Supabase project dashboard, navigate to **Authentication → Settings** and locate password security (the exact setting name/location can vary by dashboard version). Enable **leaked-password protection** if available in the project plan. Confirm it actually saves and rerun the Supabase Security Advisor. Supabase reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

**Registration password length: application validation aligned.** The signup form now displays and requires 12+ characters. `cloud.js` uses one validator for signup and password changes/recovery, rejecting short or non-string passwords before calling Supabase Auth. Passwords are passed unchanged; sign-in still accepts existing shorter passwords for server authentication. No accounts or existing passwords were changed.

**Server-side minimum remains unverified.** Browser validation can be bypassed. The Supabase Auth minimum must also be set to 12 in the project's Auth settings and verified independently; the available Supabase connector does not expose Auth configuration updates. This application change does not establish server-side enforcement. Leaked-password protection also remains disabled according to the fresh Security Advisor check. Do not claim either control is complete.

**Regression evidence for the application change:** `node --test tests/*.test.mjs` passes all 118 tests, including seven new authentication checks that execute the complete cloud module against mocked Auth methods. Coverage includes invalid signup inputs producing no Auth call, the 12-character boundary, unchanged password transmission, provider error propagation, legacy-password sign-in, password-change authentication, and matching form constraints. These tests create no real accounts and do not change production records; they are not a live signup/password-change test.

## Privileged automation RPC: reviewed, not blindly removed

Advisor notes `public.opsfusion_run_automations(uuid)` is a `SECURITY DEFINER` function executable by authenticated users. **This grant is intentional** because the signed-in UI invokes the RPC.

The live function's first statement verifies `auth.uid()` and restricts calls to either the owning workspace user or a membership with `admin`/`technician` role; the function uses an empty search path and calls the private scan function only after checking access. The `anon` role cannot execute it. Do not revoke the authenticated grant without replacing the user-triggered automation workflow and regression-testing workspace isolation.

Advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Legacy demo backups: intentional deny-by-default

`public.opsfusion_legacy_demo_backups` has RLS enabled with no client policies, resulting in an INFO finding. Treat it as **not accessible to client-side users**; do not turn off RLS or expose backup data to suppress the notice. Keep archived data until the owner approves a backup and explicit retention change.

Advisor: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Strict release acceptance checklist

1. Run all existing `node --test tests/*.test.mjs` tests in a trustworthy checkout; source-mocking tests are not full end-to-end testing.
2. Check Supabase Security and Performance Advisors and record any new findings.
3. Log in as the workspace owner; verify Service Desk tickets, assets, endpoints, and user workspace data remain accessible and unchanged.
4. Log in using a separate viewer/non-owner account; verify that other tenants' ticket and AI data are inaccessible.
5. Submit one **nonsensitive** Service Desk ticket to Gemini. Confirm a real provider response, its reported model, and that the initial analysis is read-only.
6. Check that clicking Insert Draft alone does **not** commit a work note; it must still require explicit save.
7. Check hourly automation is active, its most recent scheduled scans are successful, and alert state does not regress.
8. Check client application authentication, password reset, and new signup with valid/invalid credentials without exposing secrets in screenshots or logs.
9. Check a new code deployment reaches Vercel READY and the alias `opsfusion-it.vercel.app` points to the intended commit.
10. Preserve all account records, workspaces, real tickets, audit history, and test data unless the owner explicitly authorizes a backed-up destructive change.

## Scope of this review

This review does **not** claim that the platform has authenticated remote endpoint agents, live network device telemetry, external directory provisioning, or every tool represented in the UI. Such functionality requires separate integration and device-level acceptance evidence. Frontend demonstrations or cached browser data are not proof of real infrastructure control.

