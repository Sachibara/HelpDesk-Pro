# HelpDesk Pro

A portfolio-grade IT Service Desk / IT Help Desk management platform designed around practical ITSM workflows.

HelpDesk Pro demonstrates skills relevant to IT Service Desk, IT Help Desk, Desktop Support, Technical Support, IT Operations, Junior System Administration, and full-stack development roles.

## Architecture

HelpDesk Pro supports two operating modes:

- **Portfolio Demo Mode** — a public static deployment with realistic service desk data and interactive workflows for recruiters.
- **Live Backend Mode** — a local FastAPI + SQLite backend with persistent tickets, users, comments, assets, knowledge articles, SLA calculations, and audit history.

## Core Features

- Incident and Service Request ticket types
- Priority, impact, urgency, and severity
- Ticket lifecycle: New → Assigned → In Progress → Pending → Resolved → Closed
- SLA response and resolution timers
- SLA breach / at-risk indicators
- Technician assignment and reassignment
- Escalation levels
- Requester, Technician, and Administrator roles
- Ticket comments and work notes
- Asset / configuration-item association
- IT categories: Network, Hardware, Software, Accounts, Microsoft 365, VPN, Printer, Endpoint, Security
- Knowledge base with searchable articles
- Activity / audit timeline
- Dashboard KPIs and analytics
- Queue filtering and search
- Service desk workload view
- CSAT-ready resolution records
- REST API
- SQLite persistence
- Responsive web UI

## Project Structure

```text
HelpDesk-Pro/
├── index.html
├── styles.css
├── demo-data.js
├── app.js
├── backend/
│   ├── helpdesk_api.py
│   ├── requirements.txt
│   ├── run_backend.bat
│   └── data/
├── .github/workflows/
│   ├── ci.yml
│   └── pages.yml
├── .gitignore
└── README.md
```

## Run the Live Backend

```powershell
python -m pip install -r backend/requirements.txt
python backend/helpdesk_api.py
```

Then open:

```text
http://127.0.0.1:8790
```

The backend serves the same UI but with persistent local data.

## Public Demo

The public deployment intentionally uses representative demo data. It does not expose or depend on a private service desk database.

## Developer

**Jim Rodmark Camus**  
BSIT — Network Technology  
GitHub: [@Sachibara](https://github.com/Sachibara)
