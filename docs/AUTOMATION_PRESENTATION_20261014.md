# OpsFusion Automation Presentation — October 14–15, 2026

**Live system:** https://opsfusion-it.vercel.app/

This presentation demonstrates **real Supabase-backed IT process automation**, not a connected device agent or fabricated telemetry.

## What is implemented

- **Scheduled PostgreSQL job:** `opsfusion-cloud-automation-hourly`, runs `0 * * * *` in the database; detects matching events even when the website is closed.
- **Ticket SLA alerting:** due first response and overdue resolution on active Service Desk tickets. Completed/closed tickets are skipped.
- **Asset warranty warning:** expiry dates on saved asset records, configurable lookahead (default 45 days), severity increases after expiry.
- **Maintenance queue:** add a task in Assets, choose asset/type/due date/owner, mark Completed; configurable lookahead (default 7 days).
- **Automation Center:** run now, refresh stored alerts, acknowledge alerts, configure rules (workspace owner only), see server-recorded run timestamps.
- **Deduplication and auto-clearing:** event keys prevent repeat notifications; alerts automatically clear after relevant tickets are resolved, maintenance is completed, or warranty no longer qualifies.
- **Security:** signed-in workspaces isolated by RLS; server-side authenticated RPC validates workspace membership; background cron operates within Supabase without public API secrets.

## Rehearsal (safe demo test)

1. Open **Cloud Workspace** and sign in using the account you control.
2. Open **Automation**. Click **Refresh Results**. Read aloud the latest **manual** and, if available, **scheduled** run timestamps; do not claim a scheduled run has executed without seeing `scheduled` in the history.
3. Select **Run Checks Now**. An existing warranty record with an expired/near-term date produces a real alert if its condition is present. Confirm the alert and the new run row.
4. Go to **Assets** → **New Maintenance**. Choose an existing test asset, then encode:
   - Type: `Routine Inspection`
   - Due date: `2026-10-15` (within the 7-day alert window for an Oct 14–15 presentation)
   - Owner: `IT Support Testing`
   - Details: `Presentation rehearsal: verify asset inspection workflow and automated due-date alert. No physical maintenance performed.`
5. Wait for **Saved to Supabase**. Open **Automation** → **Run Checks Now**. The alert titled `Maintenance due soon: Routine Inspection` should appear.
6. Click **Run Checks Now** again. The newest run must show **0 new alerts** for unchanged conditions.
7. Return to **Assets** → **Maintenance Queue** → **Complete** on the new task. After the save, run checks again. The task's open alert should change to **cleared** in Automation Center.
8. Refresh the page, sign out/in, and confirm alerts and run history remain. This proves Supabase persistence, not live hardware monitoring.
9. Optionally demonstrate changing a rule threshold as the **workspace owner**, saving it, and running a new check. Restore the default of 7 maintenance days afterward.

## Expected evidence

- A run with source `manual`, real execution timestamp and counts.
- Warranty or maintenance alerts generated from real saved records.
- A second unchanged scan that creates no new alert.
- A subsequent scan that clears an alert when the underlying condition is no longer active.
- RLS-protected data for the signed-in workspace.

## What is not yet connected

No SMTP/email delivery for alerts, autonomous remediation, real Windows agent telemetry, live network diagnostic probes, AI-generated IT diagnoses, or external user directory provisioning. The `Cloud Workspace` UI must not suggest those exist.

## Interview-ready explanation

> "OpsFusion is a cloud-based IT service desk and asset operations workspace. The automation engine runs inside Supabase every hour and can also be triggered manually. It evaluates saved SLA deadlines, asset warranties and maintenance due dates, records alerts in separate protected tables, and prevents repeated notifications for the same condition. I can demonstrate the entire loop by adding a maintenance task, running the check, inspecting the new alert and audit history, then completing the task to clear the alert. We distinguish those verified business processes from live endpoint monitoring, which requires a separate authorized agent."

## Verification and cleanup

- Automated frontend checks: `node --check app.js && node --check cloud.js && node --check automation.js && node --test tests/*.test.mjs`
- Database smoke test: candidate generation, repeated scan, and automatic clearance confirmed in a rolled-back transaction.
- Confirm the scheduled cron entry remains active; its creation alone is not proof of a completed scheduled run.
- **Do not reset before final user approval.** During the final authorized interview reset, clear `opsfusion_automation_alerts`, `opsfusion_automation_runs` and `opsfusion_automation_settings` along with other dedicated workspace and account records. Preserve PostgreSQL schema, RLS and hourly job so fresh user registration can create clean settings.

