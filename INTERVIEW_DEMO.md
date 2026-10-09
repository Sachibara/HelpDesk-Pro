# OpsFusion — AI Engineer Interview Demo Guide

**Live demo:** https://opsfusion-it.vercel.app/  
**Source:** https://github.com/Sachibara/HelpDesk-Pro  
**Portfolio:** https://jimcamus.vercel.app/

## What this project solves
IT support teams often track service tickets, assets, endpoints, identities, diagnostics, and compliance in disconnected systems. OpsFusion combines these activities in a shared workflow so support events can be related to specific endpoints and the resulting incident history can be reviewed in one place.

## Five-minute screen-share route
1. Open the live demo and select **Launch Portfolio Demo**. This is a browser-local sample-data workspace; it does not touch real corporate devices.
2. Open **Service Desk** and select **New Ticket**. Walk through ticket intake, priority, and endpoint or asset references.
3. Open **Endpoint Diagnostics**, select a demo endpoint, and choose **Run Diagnostic**. Explain that public-site results are simulated; if the interface enables it, select **Create Incident** to show escalation into the service desk.
4. Open **Compliance** and explain how findings can inform remediation tracking.
5. Open **Audit Log** to show that operational actions can be traced across modules. Optionally use **Export Workspace** to show how the demo state can be saved.

## The engineering story
- **Problem:** Fragmented workflows make it harder to correlate an affected endpoint with its asset, support ticket, compliance state, and incident history.
- **Tools in repository:** HTML/CSS/JavaScript browser interface, Supabase Auth and RLS for cloud workspace, Python/FastAPI/SQLite local backend code, GitHub, Vercel.
- **Data model:** Identity → Asset → Endpoint → Diagnostic/Compliance/Remote Support → Service Desk Ticket → Audit.
- **Personal contribution:** Describe the features you actually implemented, integrated, reviewed, or tested. Be ready to open the relevant source files and discuss technical choices.
- **AI coding tools:** Name only tools you actually used and explain where they helped (for example, drafting code, debugging, test cases, or documentation), and which decisions and verification you personally performed.

## Important boundaries
The public **Portfolio Demo** is interactive and intentionally uses simulated endpoint diagnostics and remote-support actions with browser-local data. Do **not** claim that it probes external devices or remotely controls production machines. Cloud Workspace mode depends on the shared Supabase project's uptime and valid authentication; the public demo is safer and more reliable for a recruiter walkthrough.

## Before the interview
- Open the public site in an incognito browser window.
- Verify the demo launch, ticket creation, endpoint selection, diagnostics, audit changes, and browser refresh behavior.
- Test screen sharing on Zoom. Close unrelated tabs and disable desktop notifications.
- Have the code and this guide open in separate tabs.
- If a step fails, use a verified alternative instead of claiming that it works.
