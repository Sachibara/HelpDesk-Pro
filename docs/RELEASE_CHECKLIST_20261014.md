# OpsFusion Oct 14–15 Presentation — Release Acceptance

**Production:** https://opsfusion-it.vercel.app/  
**Supabase:** Dedicated project qyizwyvgbywkextsekpj  
**Source:** Sachibara/HelpDesk-Pro, main branch.

## Implemented and verified in source/database tests

- [x] Authenticated Supabase Cloud Workspace, separate from Portfolio Demo
- [x] IPv4 endpoint validation in browser and Supabase with reserved-network and duplicate checks
- [x] Asset tag and endpoint association validation in browser and Supabase
- [x] Assigned assets require an existing active workspace identity record
- [x] Three configuration-only role templates provided to empty cloud workspaces, without fake employees
- [x] Asset creation/lifecycle edits and maintenance task transitions wait for Supabase confirmation
- [x] Hourly Supabase automation scans run independently of the browser
- [x] SLA, warranty and maintenance due-date alerts, deduplication and run history
- [x] Cleared alerts reopen when conditions recur, acknowledged alerts clear on resolution
- [x] Separate RLS-protected automation data and server auditing
- [x] 59 JavaScript regression tests and database negative-path tests

## Required browser acceptance

- [ ] Sign in to Cloud Workspace, hard-refresh, create a new asset and see "Saved to Supabase".
- [ ] Create an Identity & Access → Add Identity Record, choose IT Support and confirm its persistence. This is a workspace-only record, not an Active Directory account.
- [ ] Assign the asset to the new active identity and confirm the relationship survives refresh.
- [ ] Attempt Assigned with no valid identity; the save must be rejected without mutating the asset.
- [ ] Create a new maintenance task for an existing asset due in 2–3 days. Run checks and verify the new alert, no duplicates, completion and clearing.
- [ ] Confirm the Automation Center has a recent **scheduled** run timestamp.
- [ ] Test simultaneous editing in two browser sessions; the outdated save must report a conflict.
- [ ] Register and verify an account with a non-team email address; this requires a functioning custom SMTP provider first.
- [ ] Using two accounts, verify separate workspaces in the UI and at the REST/RLS boundary.
- [ ] Request password recovery using the production redirect, reset it and verify the old password is rejected.

## External Supabase configuration still required

- Authentication → SMTP Settings: enable Custom SMTP with a verified sender domain; test delivery to an unrelated address.
- Authentication → URL Configuration: set Site URL to https://opsfusion-it.vercel.app and allow redirects to https://opsfusion-it.vercel.app/**.
- Authentication → Security and Protection: enable leaked-password protection if supported, enforce strong password policy and review rate limits.
- Keep RLS and minimum privileges enabled. Never expose service_role or SMTP secrets in frontend source.

## Capabilities not yet integrated

No authenticated Windows endpoint agent, device-pairing backend, live network probes, remote service commands, actual AD provisioning, autonomous AI diagnosis or external alert-email delivery. Those cannot be demonstrated as genuine until independently deployed and verified.

## Fresh-start reset — only with the owner's explicit confirmation

Do not reset during acceptance testing. Export evidence, back up test records, identify exactly which data will be erased, and obtain approval. The eventual dedicated-project cleanup must include workspace state, audits, automation rules, alert and run tables, memberships, profiles, legacy demo backups and Supabase Auth accounts. Preserve all schema, RLS, policies, functions, triggers, cron jobs, deployment and credentials. Verify zero data, then rehearse new registration. Portfolio Demo uses separate local sample records.
