# OpsFusion — IT Operations & Employee Support

A cloud-based platform for service desk, asset and identity management, audit logging, and scheduled alerts. Includes an employee portal for submitting requests, tracking progress, and messaging IT, plus Gemini-powered ticket assistance grounded in the Knowledge Base and approval-based work-note actions.

[IT Workspace ↗](https://opsfusion-it.vercel.app/) · [Employee Support Portal ↗](https://opsfusion-it.vercel.app/employee) · [Portfolio ↗](https://jimcamus.vercel.app/)

**Canonical repository:** `Sachibara/HelpDesk-Pro`. OpsFusion is the product name. `Sachibara/opsfusion` is an older standalone snapshot, not the maintained source for this website.

## Two experiences, one system

| Experience | Who uses it | What it provides |
| --- | --- | --- |
| IT Workspace | Authorized workspace staff | Service desk, inventory, assets, identity records, documentation, Knowledge Base, automation, AI assistance and audit history |
| Employee Support Portal | Employees enrolled by the workspace owner | Guided support requests, own-request search and filters, status explanations, and public conversations with IT |

Employees do not receive the raw workspace, other employees’ requests, asset inventory, staff Knowledge Base articles, AI tools, or internal work notes. Creating an employee account does not create a separate staff workspace or automatically grant company access.

## Employee Support Portal

The portal shares OpsFusion’s blue/indigo palette with a distinct, responsive layout designed for employees without IT knowledge.

- Sign in, register, resend confirmation emails, request password recovery, and enter a new password after a valid recovery link.
- Clear onboarding: create an account, confirm the email, then ask the company’s IT contact to enable access.
- **My requests / Ask for help** navigation, open/finished counts, search, status filters and load-more controls.
- Guided request forms ask for a topic, short subject, problem description, effect on work and optional work location. Topic and impact are context in the description; the server controls priority, requester and ownership.
- Plain-language status labels: Received, In progress, On hold, Resolved and Closed, with explanations of the next step.
- Public replies are separate from staff-only work notes. Finished conversations are read-only and offer a new-request follow-up with the previous reference.
- **Check for updates** refreshes both enrollment and requests. No automatic request-update emails are claimed.
- Failed submissions retain unsent text on the page. Reply drafts survive refreshes in memory. Switching company or signing out clears private drafts.
- A successful save followed by a failed reload is explicitly reported as saved, discouraging duplicate submission.
- Form guidance, visible focus states, status/error announcements, FAQ explanations and responsive layouts support accessibility.

### Enroll an employee

1. The employee registers at `/employee` and confirms their account email.
2. The workspace owner creates or selects the person’s **active** record under Identity & Access.
3. In **Settings → Manage Employee Access**, the owner selects that identity and links the confirmed account email.
4. The employee signs in or clicks **Check for updates**. If enrolled in multiple companies, they select the appropriate company.
5. Staff open the submitted request in Service Desk and use **Reply visible to employee** to respond.

Revoking enrollment or disabling/offboarding the identity removes portal access. Re-enrolling the same account and identity restores its portal-request history. Historical tickets created directly by staff are not automatically shared with the employee.

Limits: 20 new requests per employee/workspace per rolling day, 180-character subjects, 4,000-character server descriptions, 2,000-character replies, and 100 public messages per request. The guided form limits free text to 3,200 characters to leave room for its additional context.

See [employee access, persistence and verification details](docs/EMPLOYEE_PORTAL_AND_KNOWLEDGE.md).

## IT workspace capabilities

- **Service Desk:** tickets, impact/urgency-based priorities, SLA deadlines, assignees, linked requesters/assets/endpoints, work notes, public employee replies and activity history.
- **Endpoints:** register and edit inventory records; validate canonical, assignable IPv4 addresses and reject duplicate hostnames/IPs. Agent status remains unverified without an authorized agent.
- **Assets:** lifecycle and ownership records, valid active employee assignments, endpoint links, warranty dates and maintenance tasks. Registered assets cannot be duplicated or linked to multiple records through duplicate identifiers.
- **Identity & Access:** workspace employee records, role templates, credential-review flags and offboarding workflows. Identity records are not actual Active Directory accounts or Supabase account-administration controls.
- **Duplicate prevention:** normalized identity names/usernames and asset names/tags/serials/endpoint links are checked by the application and database. See [uniqueness rules](docs/UNIQUE_RECORDS.md).
- **Network Documentation:** IP/VLAN, subnet and port records, CIDR calculation and change notes.
- **Knowledge Base:** create, edit, search, archive and restore articles.
- **Audit & search:** recorded workspace activity, filters, global search and JSON workspace export.
- **Persistence:** queued, version-checked saves detect stale concurrent edits. Failures are reported; relevant record forms wait for database confirmation before showing success. Refresh loads the latest cloud records.

Endpoint diagnostics, remote support and compliance views explicitly show missing live-agent integration; manually entered inventory is not treated as live telemetry.

## Knowledge Base–connected AI

The authenticated `opsfusion-ai-assistant` Edge Function uses Google Gemini for ticket summaries, possible causes, recommended checks, priority/category suggestions and draft work notes. Provider secrets stay server-side; owner authorization, quotas, bounded retries and model fallback remain enforced.

Both analysis and work-note proposals retrieve up to three relevant active Knowledge Base articles from the authorized workspace. Retrieval uses deterministic keyword matching with title weighting and bounded redacted excerpts, **not vector search**. Archived articles are excluded. Ticket and article text are treated as untrusted reference material. Analysis displays retrieved article references and validates model citation IDs against those references; no-match results are disclosed.

Analysis does not change a ticket. **Insert Draft Into Work Note** fills an editor for separate review and saving. Recommendations do not prove diagnostics were performed or that an issue was fixed.

### Approval-based tool calling

**AI Propose Work Note** asks Gemini for a native `add_work_note` function call. The validated proposal is stored for **Approve & Add Note** or **Reject**. The model cannot execute it directly. Approval runs through an authenticated database transaction with audit recording, 15-minute expiry, stale-state checks and replay protection. The tool writes work notes only; it cannot run commands, control endpoints or send messages externally.

See [approval workflow](docs/APPROVAL_TOOLS.md) and [earlier AI deployment evidence](docs/AI_SERVICE_DESK_DEPLOYMENT.md).

## Scheduled cloud automation

PostgreSQL `pg_cron` runs hourly independently of the browser. The Automation Center checks saved first-response/resolution deadlines, expiring/expired warranties and scheduled maintenance. It stores workspace-scoped alerts and run history, deduplicates repeated conditions, clears resolved conditions and reactivates recurring alerts. Owners can acknowledge alerts, change lookahead rules and invoke the same scanner through **Run Checks Now**.

Automation does not perform AI decisions, remote commands, endpoint measurements or external email/SMS delivery. See [automation workflow](docs/AUTOMATION_PRESENTATION_20261014.md).

## Backend and security boundaries

OpsFusion uses its dedicated Supabase project `qyizwyvgbywkextsekpj` (Singapore), separate from the older shared OmniShare/NetOps database.

- Supabase Auth, PostgreSQL and RLS protect workspace records. Public JavaScript contains only a publishable key, never a service-role or AI-provider secret.
- Staff permissions use authenticated workspace membership/ownership. AI and employee enrollment are owner-controlled.
- `opsfusion_employee_access` has RLS and no direct browser table privileges. The authenticated portal RPC delegates to a private implementation with explicit account, enrollment, active-identity, workspace and ticket-owner checks.
- Employee writes lock the workspace row, append the request/reply and commit its audit entry atomically. Ordinary staff audit writes follow their state save and are not universally atomic with it.
- Cloud sessions do not load browser-local sample records. Ending a session clears visible private state.
- CSP, browser security headers, no-store responses and pinned Supabase JS dependencies are configured.
- New-password forms use a 12-character minimum. Server-side minimum enforcement and leaked-password protection remain outstanding verification/configuration items.

First-time schema: [`supabase/opsfusion_schema.sql`](supabase/opsfusion_schema.sql). **Do not rerun bootstrap schema files on an already provisioned database.** Additional SQL lives under `supabase/`, including employee access and approval tools. Review and apply only the changes needed for the target installation.

Auth URL configuration must permit the employee confirmation and recovery destinations, including `/employee` and `/employee?flow=recovery`. Email delivery depends on Supabase Auth/SMTP settings; UI implementation alone does not verify delivery. See [security review](docs/OPS_FUSION_PRODUCTION_SECURITY_REVIEW.md).

### Endpoint address validation

Browser and database guards reject invalid octets, alternate leading-zero spellings, unspecified/loopback/link-local, shared CGNAT, multicast, reserved, documentation and benchmarking ranges. Existing legacy exceptions cannot be used to add new invalid endpoints. Network/broadcast addresses require a known subnet/prefix to validate fully; an accepted IP does not establish ownership or connectivity. The CIDR documentation tool can describe reserved ranges without registering an endpoint.

## Update history — October 2026

| Update | Delivered changes |
| --- | --- |
| Cloud and record hardening | Dedicated backend, account/workspace isolation, queued version-checked saves, endpoint IPv4 validation, identity/asset uniqueness, editable records, maintenance and offboarding workflows |
| Scheduled automation | Hourly SLA/warranty/maintenance scans, run history, deduplicated alerts, clearance/reactivation and owner controls |
| AI assistance and approvals | Gemini ticket analysis, reviewed work-note drafts and approval-based `add_work_note` proposals |
| Employee portal | Owner-managed enrollment, restricted request API, employee submissions/status/replies and staff public-reply controls |
| Knowledge-backed AI | Active-article retrieval, bounded excerpts, source references and citation validation in ticket analysis; article context in tool proposals |
| Demo removal | Deleted `INTERVIEW_DEMO.md` and `demo-data.js`; removed demo launch, local sample storage, fake endpoint execution, demo import/reset handlers and local-backend sample seeding. Entry button opens Employee Support Portal |
| Employee experience | Blue/indigo redesign, guided forms, account recovery/resend, request search/filters, plain-language statuses, FAQs, access refresh and clearer save/error behavior |
| Layout improvements | Larger readable controls/text, responsive workspace layout, header spacing, clearer workspace-record and telemetry text; removed obsolete workspace/footer and portfolio-mode labels |
| 16 October release presentation | Removed **PHASE 3** from login. Updated project/profile/portfolio descriptions; OpsFusion remains the second flagship with IT Workspace, Employee Support Portal and GitHub links |

Existing cloud accounts and records were preserved during the portal and demo-removal updates. Historical administrator-only database backups were retained; deleting demo source code did not delete production records.

## Verification

**174 automated Node tests passed** for the portal release checked on 16 October 2026 (Asia/Singapore). The suite covers record validation, save/session handling, AI authorization/retries/proposals, Knowledge Base retrieval/citations, and employee request/account UI logic using service doubles.

```sh
node --test tests/*.test.mjs
node --check app.js
node --check cloud.js
node --check employee.js
node --check employee-model.js
```

Rollback-only database tests in [`tests/employee-portal-database.sql`](tests/employee-portal-database.sql) previously passed for employee access, ownership enforcement, restricted projections, cross-workspace denial, inactive identities and revocation. Production entry-to-portal navigation, portal rendering and FAQ navigation were checked in a browser. Earlier service and AI verification is documented separately; it is not a claim that every newly changed path has been exercised with live accounts.

**Remaining acceptance:** signed-in owner/employee browser workflows, real confirmation/recovery email delivery for the refreshed portal, and a live knowledge-backed Gemini response. Automated and mocked tests do not establish complete production correctness.

## Not yet integrated

- Authenticated device enrollment/agents, verified CPU/RAM/patch/AV heartbeats, real network probes or privileged service control.
- Real Active Directory or external identity-provider provisioning.
- Automated employee invitations, attachments, automatic request-update emails or external automation-alert delivery.
- Employee access to staff Knowledge Base articles or AI tools, vector retrieval, autonomous device diagnosis/remediation.

## Stack and source layout

Current cloud system: **HTML5 · CSS3 · JavaScript · Supabase Auth · PostgreSQL · Edge Functions (TypeScript/Deno) · Google Gemini · Vercel**.

- `index.html`, `styles.css`, `app.js`, `cloud.js`, `automation.js`: staff workspace.
- `employee.html`, `employee.css`, `employee.js`, `employee-model.js`: employee experience.
- `employee-admin.js`: owner enrollment controls.
- `supabase/`: schema, integrity rules, portal/approval APIs and AI functions.
- `tests/`: automated regressions and database acceptance scripts.
- `backend/`: retained Python/FastAPI/SQLite backend; starts empty, and is not the public site’s production data service.

**Developer:** Jim Rodmark Camus · BSIT — Network Technology · [@Sachibara](https://github.com/Sachibara)

## 17 October — employee identity and control consistency

- New identity records no longer generate a username, `@corp.local` address, or password-reset claim. Identity views show an email only from a confirmed portal enrollment; unlinked records show “No linked portal account”.
- Employee access management includes a selection prompt, active/unlinked identity filtering, prerequisite explanations, refresh, form validation, and revoke/re-enroll support. Confirmed portal accounts and workspace identities must both exist before the owner grants access. Owners/staff cannot enroll as employees in the same workspace.
- Workspace and portal controls share a font family and 14px control text. Settings descriptions, form labels, table text, dropdown options and the employee access dialog use consistent role-based typography.
- 180 automated tests passed. Database integration checks passed with rolled-back fixtures; this does not replace signed-in browser acceptance or live email/AI-provider testing. No live records were changed by these tests.

## Shared IT staff access — 17 October 2026

The workspace owner can now open **Settings → Manage IT Staff** to grant, change or revoke membership for a confirmed account. Each technician uses their own credentials and accesses the same workspace records, service queue and internal notes. Authorized non-viewer staff appear in ticket assignment choices. Server audit events retain the acting user ID; the UI resolves current staff IDs to email addresses.

1. Ask the staff member to register and confirm their account using the Employee Support Portal registration page. No employee enrollment is needed for staff.
2. As owner, select the intended workspace and open **Manage IT Staff**. Enter the confirmed email and choose Technician, Administrator or Viewer.
3. The staff member signs in at the IT Workspace. If they have access to multiple existing workspaces, **Settings → Current workspace** selects the intended company.
4. Revoke staff membership to block subsequent server reads and writes. Already downloaded information cannot be recalled; role changes are reflected in controls after signing in again.

Technicians and administrators currently have the same broad record-editing permissions; viewers can read the full IT workspace but cannot edit it. Owner-only staff/employee enrollment, AI approvals and automation administration remain owner-only. Fine-grained per-module permissions are not implemented. Employee enrollment and staff membership are mutually exclusive within one workspace.

Public IT signup is no longer offered, bootstrap no longer creates workspaces, and database grants prohibit browser workspace creation and direct membership mutation. Existing workspaces and owners were preserved. Previously created private workspaces are not automatically deleted or merged.

Verification: **184 automated tests passed**, plus transaction-rollback database checks covering technician reads/writes, viewer restrictions, owner-only grants, self-escalation denial, workspace-creation denial, revocation, employee separation, and audit actor attribution. Employee portal database regression checks also passed. A signed-in multi-browser acceptance rehearsal is still required; these checks do not prove every provider integration.

The employee portal supports registration/recovery, owner enrollment, own-request submission/search/status, public replies and access refresh. Remaining additions include attachments, ticket-update email notifications, employee-facing Knowledge Base access, automated invitations, and satisfaction feedback. No new email notifications are sent by staff enrollment.

Security review: the new staff RPC uses a private implementation with authenticated owner/membership checks and an invoker API wrapper. Existing advisor warnings include leaked-password protection disabled ([configuration guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)) and existing explicitly guarded SECURITY DEFINER APIs ([review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).
