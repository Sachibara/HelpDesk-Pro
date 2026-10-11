# OpsFusion — Final Cloud Workflow Acceptance (October 14–15, 2026)

Production site: https://opsfusion-it.vercel.app/

## Deployment scope

This release ensures **workspace identity → assigned asset → Service Desk ticket** remains consistent even if a database write is rejected. It does not create Active Directory accounts, modify a user's Supabase Auth password, or contact a Windows endpoint without an authorized agent.

## Pre-presentation browser verification

Use **Cloud Workspace** with your existing administrator account. After deploying, press Ctrl+Shift+R and use **Refresh Cloud Data**.

1. **Identity:** Open Identity & Access → Add Identity Record. Use the currently saved active identity if one already exists; otherwise create a clearly marked test identity: first name "Presentation", last name "Tester", Role Template "IT Support", Job Title "IT Support Technician". Verify that the identity **and a new onboarding-review ticket** are visible after Refresh Cloud Data. Do not create duplicate entries if the test has already passed.
2. **Assignment:** Open Assets → choose an existing available asset → select Lifecycle Status "Assigned" and that active identity. Click Save Asset. Confirm **Saved to Supabase**, then refresh and confirm the same status and assignee. Test Assigned without an active identity and confirm the application refuses to save it.
3. **Ticket:** Click Create Ticket from the asset or go to Service Desk → New Service Desk Ticket. Give it a clearly labeled test title, e.g., "PRESENTATION TEST — printer connection". Select Hardware / Asset, Medium impact and Medium urgency. Link the asset and an active IT requester/technician if relevant; confirm the record exists after Refresh Cloud Data.
4. **First response:** Open that ticket → Details → Record First Response. Verify its timeline shows the action after refreshing.
5. **Work note:** Add: "Presentation test: simulated investigation of a workstation and printer connection; no real network probe or device repair executed." Verify its timeline persists.
6. **Resolution:** Change the ticket status dropdown to Resolved. Refresh and verify status, work note, first-response timestamp and updated audit history.
7. **Offboarding:** Only on a **new, disposable workspace identity record** and disposable asset, test Disable Workspace Identity or Offboard Record. The linked asset must automatically return to Available/Unassigned, and offboarding must create a linked review service ticket. Do not offboard a record you intend to present.
8. **Access control:** A read-only workspace participant, if one has been explicitly provisioned, must not be able to change tickets, assignments, or identity records. Account isolation across independently owned workspaces has already been tested at the RLS boundary.
9. **Automation:** Run checks, demonstrate a due-soon maintenance record and warranty alert, repeat to prove deduplication, complete a task and prove alert clearance, and point to the independently scheduled run history.
10. **Email authentication:** The second test account already received verification and password recovery messages. Re-test externally only if you change SMTP, redirects or email templates.

## Acceptance evidence

Take screenshots of the **Cloud Workspace** badge, one saved identity, its assigned asset, the associated ticket with response/note/status history, the Automation Center alert plus scheduled run timestamp, and the refreshed Supabase state. The system must never be described as executing remote actions, live telemetry, AI diagnosis, real AD provisioning, or production-wide email alerting until those connections exist.

## Security and remaining dependencies

- Supabase's security advisor reports **Leaked Password Protection Disabled**. Enable in the Supabase Authentication dashboard when available; then re-check the advisor.
- The `opsfusion_run_automations` SECURITY DEFINER RPC intentionally uses a restricted authenticated owner/operator check. Two-account cross-workspace access has been denied in SQL role tests; review this function before opening the platform publicly.
- The legacy backup table has RLS enabled with no user-access policies. Leave administrative historical backups preserved until the approved final reset.
- Custom Gmail SMTP was manually configured and received real signup and password-reset emails, but a dedicated transactional provider is preferred for higher-volume use.

## Final reset policy

**DO NOT DELETE** any workspace, Supabase Auth user, audit row, automation alert, scan history, or archival backup before the owner explicitly approves the agreed final reset, after backups are created. Keep the Supabase schema, RLS, migrations, functions, hourly scheduler and deployed website intact. Until then, retain both test accounts and their separate workspaces.
