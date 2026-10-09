# OpsFusion — Unified IT Operations Platform

**Canonical IT-operations flagship for the Sachibara portfolio.**

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

## Production functionality and remaining integrations

OpsFusion is being hardened as a **working cloud-based IT service desk and inventory/documentation workspace**, not falsely represented as a complete endpoint-management platform.

- **Implemented:** Supabase email/password authentication, email recovery and signed-in password change, private RLS-protected workspace, ticket and incident management, device and asset record management, user records, IP/VLAN documentation, knowledge articles, record audit events, import/export for the isolated demo, and cloud refresh.
- **Cloud save reliability:** Saves are queued and version-checked against the last database `updated_at` value. A conflicting edit from another browser or device is blocked and reported; it is not silently overwritten. The interface shows the server save state and waits for pending changes before sign-out.
- **Browser privacy:** Ending an authenticated session hides and clears private workspace data from the interface. Browsers that block requests to Supabase can still fail to connect; users should review their tracking protection settings.
- **Not integrated:** Windows/macOS/Linux agent deployment, authenticated device pairing, verified CPU/RAM/OS/patch/AV heartbeats, real ping/traceroute/DNS probes, privileged service control, genuine Active Directory/identity-provider provisioning, cloud job scheduler, and infrastructure alerts. These depend on separately authorized systems and cannot be made real by hardcoded browser data.
- **Recovery email setup:** The dedicated Supabase project's **Authentication > URL Configuration** must whitelist `https://opsfusion-it.vercel.app/**` and set its Site URL to `https://opsfusion-it.vercel.app`. Supabase's default email service has sending restrictions; a suitable SMTP provider may be required for unrestricted public registrations.
- **Verification:** Source-code syntax checks and a mocked two-device save-conflict test passed. Vercel production deployments are checked separately. Full interactive account workflows and remote-agent functions require actual device/browser tests before being called production-verified.

### Real-agent completion criteria

A future agent release must use per-device identity, enrollment approval, scoped permissions, signed updates, encrypted transport, heartbeat freshness, explicit action authorization, immutable audit trails, and a way to revoke access. Until then, Cloud Workspace labels monitoring as **not connected**, not online/offline.

## Cloud Workspace: server-backed records only

The **authenticated live site** never initializes a cloud workspace from portfolio demo data or from browser localStorage.

- Newly registered cloud accounts start with empty, private records in the dedicated OpsFusion Supabase project.
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

HTML5 · CSS3 · JavaScript · Supabase · Python · FastAPI · SQLite

## Developer

**Jim Rodmark Camus**  
BSIT — Network Technology  
GitHub: [@Sachibara](https://github.com/Sachibara)
