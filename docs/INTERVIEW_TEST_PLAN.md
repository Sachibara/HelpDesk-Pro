# OpsFusion pre-interview verification plan

This document separates **source-level checks** from **real browser and database evidence**. Do not claim remote monitoring is tested without a connected, authorized endpoint agent.

## Baseline

Use the authenticated **Cloud Workspace** at https://opsfusion-it.vercel.app/. Do not use Portfolio Demo for persistence tests.

Before each test, record the current endpoint/asset/ticket counts, capture the cloud save indicator and refresh from Supabase. Keep an existing verified endpoint until all tests are complete.

## Test 3: Invalid IPv4 addresses

Open **Endpoints > Add Endpoint**. Enter hostname `TEST-IP-VALIDATION`, site `Home Lab`, type `Workstation` and try each IP **individually**:

| IPv4 input | Expected |
| --- | --- |
| `192.168.100.256` | Rejected: octet outside 0–255 |
| `192.168.100` | Rejected: only 3 sections |
| `192.168.100.10.5` | Rejected: 5 sections |
| `192.168.abc.10` | Rejected: nonnumeric |
| `192.168.-1.10` | Rejected: negative section |
| `192.168.100.10/24` | Rejected: CIDR is not a host address |
| Blank | Rejected: required |
| `192.168.1.5.5` | Rejected: 5 sections |
| `0.0.0.0` | Rejected: unspecified |
| `127.0.0.1` | Rejected: loopback |
| `255.255.255.255` | Rejected: broadcast/reserved |
| `224.0.0.1` | Rejected: multicast |
| `192.168.001.010` | Rejected: ambiguous leading zeros |

Expected for every negative case: **Invalid endpoint** notification, dialog remains open, zero new endpoints, no new Inventory audit events. Reopen the modal as needed. Confirm with **Refresh Cloud Data** and a database query.

Basic source-level regression suite: `node --check app.js && node --check cloud.js && node --test tests/*.test.mjs`.

## Remaining manual tests

1. **Positive input and asset lifecycle** — Register one distinct valid private IPv4 host, link a new asset, update assignment/maintenance fields, refresh, sign out/in, confirm persisted. Avoid claiming online status without an agent.
2. **Network documentation** — Add a VLAN/CIDR using a real or reserved test network, add a switch endpoint and a port mapping, confirm persistence and documentation history. Verify invalid CIDR rejection and empty/missing port details.
3. **Service Desk** — Create an incident linked to that asset, record a first response, add a work note, change status through In Progress to Resolved, verify links and server audit events.
4. **Account recovery** — With a test email you control, request a password reset, follow the authorized production-domain redirect, change the password and verify the old password no longer authenticates.
5. **Account isolation / RLS** — Log in as a separately verified second account in another private browser. Its new workspace should be empty. It must not see another user's records. Verify permission behavior at the API/RLS level; a UI-only demonstration is not a security proof.
6. **Offline save behavior** — Temporarily disconnect the test PC, change a safe workspace setting, confirm OpsFusion reports an unsaved error, reconnect and recover without assuming a silent save. Export any unsaved work before refreshing if a conflict is reported.
7. **Two-session conflict** — Open the same account in two separate sessions, change a safe setting in one session, then make an out-of-date change in the other. The second save must report a conflict; it must not silently overwrite the first. Test only after exporting the workspace.

## Production release checks

- Supabase project reports healthy; RLS enabled on cloud tables.
- Verify email confirmation redirects at `https://opsfusion-it.vercel.app/`.
- Test non-team-member signup before promising interviewer self-registration. Supabase default SMTP restricts outgoing emails; configure an authorized external SMTP provider if needed.
- Review Supabase Security Advisor, including leaked-password protection status.
- Run automated tests and do a real desktop browser walkthrough.

## Final interview reset (explicit owner approval required)

**Do not perform during testing.** Back up and export all test evidence before clearing application records and Supabase Auth accounts. Use targeted, controlled deletion in the **dedicated OpsFusion project only**. Preserve schema, RLS policies, Supabase credentials, Vercel domain, GitHub code, and the project itself. Include the administrator-only legacy demo backup in the reset inventory if zero retained data is required. Verify all counts afterward and rehearse fresh account registration. The built-in Portfolio Demo has separate, intentional example content.
