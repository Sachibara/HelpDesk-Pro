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
- The dedicated project initially has zero users and workspace data; create an account in Cloud Workspace to begin using its persistent backend. Supabase email confirmation may be required depending on Auth settings.
- **Do not rerun** the first-time SQL file on the already provisioned database because policy and table creation is not intended as an idempotent migration. Future database changes should use versioned migrations.

Existing OmniShare and NetOps projects were not modified by this migration.


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
