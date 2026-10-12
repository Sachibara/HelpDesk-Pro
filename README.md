# OpsFusion — Unified IT Operations Platform

**Canonical IT-operations flagship for the Sachibara portfolio.**

OpsFusion is the product name; `Sachibara/HelpDesk-Pro` is its actively maintained source repository. [`Sachibara/opsfusion`](https://github.com/Sachibara/opsfusion) is an older September 2026 standalone snapshot and is not synchronized with this codebase.

**Live demo:** https://opsfusion-it.vercel.app/

## Dedicated Supabase backend (OpsFusion only)

OpsFusion has its own Supabase project in Sachibara's Org, **OpsFusion** (`qyizwyvgbywkextsekpj`, Singapore). The browser frontend connects to this project using its own URL and publishable key in `cloud.js`. It does **not** connect to the older shared OmniShare/NetOps database.

- Project Auth manages OpsFusion user accounts independently.
- `opsfusion_profiles`, `opsfusion_workspaces`, `opsfusion_memberships`, and `opsfusion_audit_events` have Row Level Security enabled.
- Anonymous clients have no table access; authenticated clients have role-appropriate privileges. Workspace owner identifiers cannot be edited through the browser.
- Reproducible first-time database setup: [`supabase/opsfusion_schema.sql`](supabase/opsfusion_schema.sql).
- The public **Portfolio Demo** still works with browser-local demo data; it deliberately simulates remote endpoint activity rather than claiming to control production infrastructure.
- Cloud Workspace requires a confirmed Supabase Auth account. New accounts begin with an empty private workspace; email confirmation may be required depending on Auth settings.
- **Do not rerun** the first-time SQL file on the already provisioned database because policy and table creation is not intended as an idempotent migration. Future database changes should use versioned migrations.

Existing OmniShare and NetOps projects were not modified by this migration.

## Endpoint IPv4 protection — browser and database

Managed endpoint registration checks canonical, assignable IPv4 input while typing, and the Add Endpoint button stays disabled until the required fields are valid. The frontend waits for Supabase to accept the new endpoint before showing a success message. Production static responses request no browser caching so outdated form code is not silently reused.

A dedicated `opsfusion_enforce_endpoint_integrity` trigger on `public.opsfusion_workspaces` independently rejects newly entered invalid or non-assignable endpoint addresses and duplicate hostnames or IPs, including writes from older clients. This includes invalid octets, alternate leading-zero spellings, unspecified/loopback/link-local, shared CGNAT, multicast, reserved, documentation and benchmarking ranges. The CIDR documentation calculator remains separate and can describe reserved networks without registering them as endpoints.

**Legacy test evidence:** The pre-fix `TEST-IP-VALIDATION` record using `0.0.0.0` was confirmed in Supabase. The database guard tolerates this specific existing invalid record only while its identifier, hostname, and address remain unchanged; it cannot be used to add further invalid endpoints. The owner plans to remove all test data and accounts in the **explicitly approved final interview reset**, not during active testing.

**Scope:** A host's subnet network and directed broadcast address cannot be inferred reliably from an IPv4 address alone; reliable enforcement for those requires a known subnet/prefix. IPv4 validation also does not establish ownership of public IP addresses or verify actual network connectivity.

## Real cloud automation (October 2026)

OpsFusion's **Automation Center** is a live Supabase feature, separate from the Portfolio Demo. PostgreSQL `pg_cron` runs an hourly scanner independently of browser sessions. It detects active tickets with overdue first-response or resolution SLAs, expiring/expired asset warranties, and upcoming/overdue scheduled maintenance tasks. Automation alerts and timestamped run history are stored in separate workspace-scoped, RLS-protected tables, and the in-app **Run Checks Now** button executes the same server-side scan. Alerts are deduplicated and automatically clear when their source conditions disappear; owners can acknowledge an alert and edit due-date lookahead rules. The Assets tab lets operators create and complete maintenance tasks.

This automation does **not** send emails or SMS, make AI decisions, run remote commands, or measure real endpoint telemetry. Those require separately configured integrations. See [presentation rehearsal](docs/AUTOMATION_PRESENTATION_20261014.md) for a live Oct 14–15 workflow and exact values.

## Gemini AI Service Desk Assistant

The authenticated `opsfusion-ai-assistant` Edge Function provides ticket summaries, possible causes, recommended checks, priority/category suggestions, and draft work notes through Google Gemini. Limited ticket text is sent only when the workspace owner requests analysis. Provider secrets stay server-side; requests have quotas, bounded retries, and a fallback model. Live successful Gemini responses have been verified.

Analysis does not modify tickets. **Insert Draft Into Work Note** fills the editor; the user must review it and separately click **Add Work Note** to save. Use nonsensitive demo tickets and review the provider disclosure. See [AI deployment evidence](docs/AI_SERVICE_DESK_DEPLOYMENT.md).

## Password validation and security status

Signup, password recovery, and password changes use a 12-character application minimum. Existing passwords and accounts were preserved. Server-side minimum enforcement remains unverified, and leaked-password protection remains an outstanding Auth setting. See [production security review](docs/OPS_FUSION_PRODUCTION_SECURITY_REVIEW.md).

## Production functionality and remaining integrations

OpsFusion is being hardened as a **working cloud-based IT service desk and inventory/documentation workspace**, not falsely represented as a complete endpoint-management platform.

- **Implemented:** Supabase email/password authentication, email recovery and signed-in password change, private RLS-protected workspace, ticket and incident management, device and asset record management, user records, IP/VLAN documentation, knowledge articles, record audit events, import/export for the isolated demo, and cloud refresh.
- **Cloud save reliability:** Saves are queued and version-checked against the last database `updated_at` value. A conflicting edit from another browser or device is blocked and reported; it is not silently overwritten. The interface shows the server save state and waits for pending changes before sign-out.
- **Browser privacy:** Ending an authenticated session hides and clears private workspace data from the interface. Browsers that block requests to Supabase can still fail to connect; users should review their tracking protection settings.
- **Not integrated:** Windows/macOS/Linux agent deployment, authenticated device pairing, verified CPU/RAM/OS/patch/AV heartbeats, real ping/traceroute/DNS probes, privileged service control, genuine Active Directory/identity-provider provisioning, external email delivery, and agent-driven infrastructure alerts. These depend on separately authorized systems and cannot be made real by hardcoded browser data.
- **Recovery email setup:** The dedicated Supabase project's **Authentication > URL Configuration** must whitelist `https://opsfusion-it.vercel.app/**` and set its Site URL to `https://opsfusion-it.vercel.app`. Supabase's default email service has sending restrictions; a suitable SMTP provider may be required for unrestricted public registrations.
- **Verification:** Source-code syntax checks and a mocked two-device save-conflict test passed. Vercel production deployments are checked separately. Full interactive account workflows and remote-agent functions require actual device/browser tests before being called production-verified.

### Real-agent completion criteria

A future agent release must use per-device identity, enrollment approval, scoped permissions, signed updates, encrypted transport, heartbeat freshness, explicit action authorization, immutable audit trails, and a way to revoke access. Until then, Cloud Workspace labels monitoring as **not connected**, not online/offline.

## Cloud Workspace: server-backed records only

The **authenticated live site** never initializes a cloud workspace from portfolio demo data or from browser localStorage.

- Newly registered cloud accounts start with empty, private user, asset, endpoint and ticket records in the dedicated OpsFusion Supabase project. Three **configuration-only** role templates are available to create genuine workspace identity records (not AD accounts).
- Asset and maintenance edits wait for Supabase confirmation, reject duplicate asset tags, and require valid active identity references. Database triggers enforce endpoint/asset integrity even against outdated clients.
- A previously initialized workspace containing only the original demo records was safely archived in `public.opsfusion_legacy_demo_backups` (administrator-only) and reset to an empty inventory. Account/authentication and workspace identity were retained.
- Cloud inventory, tickets, assets, identity records, documentation and knowledge-base entries are **user-managed records**, stored in Supabase and restored on sign-in. They are not automatically discovered infrastructure.
- The **Refresh Cloud Data** button loads the latest saved server workspace and audit history; browser-local data does not override cloud records.
- Until an authorized endpoint agent and telemetry ingestion service exist, Cloud Workspace displays **No telemetry / Not measured** instead of artificial uptime, health curves, compliance rates, diagnostics, or remote commands. Simulated diagnostic, remote-action, compliance-evaluation, sample import and demo reset controls cannot run in Cloud Workspace.
- **Portfolio Demo** is clearly separate and uses mock data for guided demonstrations. It does not upload its mock records into Cloud Workspace.
- The public cloud application must not be presented as active LAN monitoring, real remote control, real AD provisioning, or continuously streaming endpoint telemetry without those integrations.



**Portfolio:** https://jimcamus.vercel.app/

OpsFusion consolidates the strongest workflows from:

- HelpDesk Pro
- IT Asset Manager
- AD User Provisioning Simulator
- LAN Deployment & Remote Support Console
- Patch & Endpoint Compliance Dashboard
- endpoint troubleshooting and operational documentation workflows

## Shared operational model

`Identity → Asset → Endpoint → Diagnostic/Compliance/Remote Support → Service Desk Ticket → Audit`

The platform uses a shared record model so incidents, assets, identities, endpoints, compliance findings, remote-support actions, and audits stay connected.

## Modules

- Executive / Operations Overview
- Service Desk / ITSM
- Endpoint Inventory
- IT Asset Lifecycle
- Identity & Access
- Endpoint Troubleshooting
- Remote Support
- Patch & Endpoint Compliance
- Knowledge Base
- Audit & Global Search

## Modes

### Portfolio Demo
Recruiter-friendly browser workspace with safe local demo data. It does not remotely control unmanaged endpoints or expose arbitrary command execution.

### Cloud Workspace
Supabase Auth + RLS-protected persistent workspace. The frontend contains only a Supabase publishable key and never a service-role/secret key.

### Preserved local backend
This repository retains the original HelpDesk Pro `backend/` code for local/persistent service-desk operation. The public unified frontend remains separated from privileged/private infrastructure access.

## Security principles

- role-based cloud workspace model
- Supabase RLS
- publishable key only in public client code
- no arbitrary shell/command runner
- ticket/change reference requirement for simulated state-changing support actions
- no real enterprise credentials in the public demo
- CSP and browser security headers
- pinned Supabase JS client version

## Stack

Current cloud application: HTML5 · CSS3 · JavaScript · Supabase Auth · PostgreSQL · Supabase Edge Functions (TypeScript/Deno) · Google Gemini API · Vercel.

Preserved local backend: Python · FastAPI · SQLite.

## Developer

**Jim Rodmark Camus**  
BSIT — Network Technology  
GitHub: [@Sachibara](https://github.com/Sachibara)

## October 14–15 release qualification

As of October 13, 2026 (Philippines): **118 automated regression tests pass**. GitHub Actions checks passed for the password-validation release `c992e9b`, and the production alias serves that release. Tests include mocked integrations and do not replace a complete live browser rehearsal.

Verified evidence includes cloud persistence, endpoint/asset validation, live hourly SLA/warranty/maintenance scans, alert clearing/reactivation, and successful Gemini responses. Custom SMTP signup/recovery delivery was verified in the earlier acceptance session.

Before presenting, rehearse the exact deployed workflow: sign in, open a sample ticket and its linked asset, request AI analysis, review and save a work note, refresh to confirm persistence, and show scheduled automation history. Separate-account UI permissions and simultaneous-save conflicts remain part of the final browser acceptance checklist. See [production security review](docs/OPS_FUSION_PRODUCTION_SECURITY_REVIEW.md) for current evidence and outstanding controls.

**Additional integrations:** Authenticated endpoint agents, OS/service control, live network probes, real AD provisioning, and external automation-alert delivery are not implemented. AI assistance is implemented; autonomous device diagnosis/remediation is not.
