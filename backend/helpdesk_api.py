from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "data"
DB_PATH = DATA_DIR / "helpdesk.db"
UPLOAD_DIR = DATA_DIR / "uploads"
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

SLA = {
    "P1": {"response": 1, "resolution": 2},
    "P2": {"response": 2, "resolution": 8},
    "P3": {"response": 4, "resolution": 24},
    "P4": {"response": 8, "resolution": 72},
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL,
                department TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assets (
                id INTEGER PRIMARY KEY,
                hostname TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL,
                owner TEXT NOT NULL,
                serial TEXT NOT NULL,
                platform TEXT NOT NULL,
                status TEXT NOT NULL,
                location TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number TEXT UNIQUE,
                type TEXT NOT NULL,
                subject TEXT NOT NULL,
                description TEXT NOT NULL,
                requester_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                asset_id INTEGER,
                impact TEXT NOT NULL,
                urgency TEXT NOT NULL,
                priority TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'New',
                assignee_id INTEGER,
                escalation INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                response_due TEXT NOT NULL,
                resolution_due TEXT NOT NULL,
                first_response_at TEXT,
                resolved_at TEXT,
                csat INTEGER,
                FOREIGN KEY(requester_id) REFERENCES users(id),
                FOREIGN KEY(assignee_id) REFERENCES users(id),
                FOREIGN KEY(asset_id) REFERENCES assets(id)
            );

            CREATE TABLE IF NOT EXISTS activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL,
                at TEXT NOT NULL,
                actor_id INTEGER,
                actor_name TEXT NOT NULL,
                action TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                summary TEXT NOT NULL,
                body TEXT NOT NULL,
                views INTEGER NOT NULL DEFAULT 0,
                helpful INTEGER NOT NULL DEFAULT 100,
                tags TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                uploaded_by INTEGER,
                uploaded_by_name TEXT NOT NULL,
                FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            );
            """
        )
        seed_database(conn)
        conn.commit()


def seed_database(conn: sqlite3.Connection) -> None:
    if not conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
        conn.executemany(
            "INSERT INTO users(id,name,email,role,department) VALUES(?,?,?,?,?)",
            [
                (1, "Alyssa Reyes", "alyssa.reyes@contoso.local", "Requester", "Finance"),
                (2, "Marco Santos", "marco.santos@contoso.local", "Requester", "Operations"),
                (3, "Nina Cruz", "nina.cruz@contoso.local", "Requester", "Human Resources"),
                (10, "Jim Camus", "jim.camus@helpdesk.local", "Administrator", "IT"),
                (11, "Kevin Lim", "kevin.lim@helpdesk.local", "Technician", "IT"),
                (12, "Rhea Mendoza", "rhea.mendoza@helpdesk.local", "Technician", "IT"),
            ],
        )

    if not conn.execute("SELECT 1 FROM assets LIMIT 1").fetchone():
        conn.executemany(
            """
            INSERT INTO assets(id,hostname,type,owner,serial,platform,status,location)
            VALUES(?,?,?,?,?,?,?,?)
            """,
            [
                (1, "FIN-LT-014", "Laptop", "Alyssa Reyes", "LNV-83F4A2", "Windows 11 Pro", "In Service", "Finance"),
                (2, "OPS-DT-022", "Desktop", "Marco Santos", "DEL-72D19B", "Windows 11 Pro", "In Service", "Operations"),
                (3, "HR-LT-008", "Laptop", "Nina Cruz", "HP-19A8D1", "Windows 11 Pro", "In Service", "Human Resources"),
                (4, "CORE-SW-01", "Switch", "IT Infrastructure", "CSC-9200-01", "Cisco IOS XE", "In Service", "MDF"),
                (5, "AP-F2-03", "Access Point", "IT Infrastructure", "UBQ-U6-003", "UniFi", "In Service", "Floor 2"),
                (6, "PRN-FIN-01", "Printer", "Finance", "HP-M428-11", "Embedded", "Degraded", "Finance"),
                (7, "SRV-AD01", "Server", "IT Infrastructure", "DEL-R550-01", "Windows Server 2022", "In Service", "Server Room"),
                (8, "SPARE-LT-02", "Laptop", "IT Stock", "ACR-SWIFT-02", "Windows 11 Pro", "Available", "IT Stockroom"),
            ],
        )

    if not conn.execute("SELECT 1 FROM knowledge LIMIT 1").fetchone():
        conn.executemany(
            """
            INSERT INTO knowledge(title,category,summary,body,views,helpful,tags)
            VALUES(?,?,?,?,?,?,?)
            """,
            [
                (
                    "VPN authentication failure after password change",
                    "VPN",
                    "Clear cached VPN credentials and verify account synchronization after an AD password reset.",
                    "Verify the account is not locked, validate the new password, remove saved VPN credentials, reconnect, and review authentication logs if the failure continues.",
                    184, 97, "VPN,Active Directory,Credentials",
                ),
                (
                    "Troubleshoot APIPA / DHCP connectivity",
                    "Network",
                    "First-line workflow when a Windows endpoint receives a 169.254.x.x address.",
                    "Check physical link, switch port, ipconfig, DHCP scope, VLAN assignment, and DHCP relay before renewing the lease.",
                    241, 95, "DHCP,Windows,Network",
                ),
                (
                    "Repeated Active Directory account lockout",
                    "Account Access",
                    "Identify stale credentials and common lockout sources.",
                    "Check lockout source, mapped drives, scheduled tasks, mobile mail profiles, saved RDP credentials, and services running under the affected identity.",
                    156, 94, "AD,Lockout,Windows",
                ),
                (
                    "Outlook desktop synchronization checklist",
                    "Microsoft 365",
                    "Validate connectivity, cached mode, profile state, and Microsoft 365 service health.",
                    "Confirm Outlook Web works, check service health, Work Offline, connection status, safe mode, OST health, and profile state.",
                    132, 92, "Outlook,M365,Email",
                ),
                (
                    "Printer offline - service desk triage",
                    "Printer",
                    "Standard checks for network printers reporting offline.",
                    "Verify power and display errors, ping the printer, open its web UI, validate TCP/IP port, clear stuck jobs, restart spooler, and inspect hardware state.",
                    205, 90, "Printer,Spooler,TCP/IP",
                ),
            ],
        )

    if not conn.execute("SELECT 1 FROM tickets LIMIT 1").fetchone():
        now = datetime.now(timezone.utc)
        demo_tickets = [
            (
                "Incident", "Finance printer unavailable after paper jam",
                "PRN-FIN-01 remains offline after clearing a paper jam. Users cannot print invoices.",
                1, "Printer", 6, "Medium", "High", "P2", "In Progress", 11, 1, -5.5, -0.4
            ),
            (
                "Incident", "VPN authentication fails after password reset",
                "User changed Active Directory password and now receives authentication failure in corporate VPN.",
                2, "VPN", 2, "High", "High", "P1", "Assigned", 10, 2, -1.1, -0.2
            ),
            (
                "Service Request", "New Microsoft 365 shared mailbox access",
                "Finance manager requests access to the AP shared mailbox.",
                1, "Microsoft 365", None, "Low", "Medium", "P3", "Pending", 12, 0, -8, -2
            ),
            (
                "Incident", "Intermittent Wi-Fi on Floor 2",
                "Several users report Wi-Fi drops near meeting rooms on Floor 2.",
                2, "Network", 5, "High", "Medium", "P2", "New", None, 0, -0.7, -0.7
            ),
            (
                "Incident", "User account locked repeatedly",
                "HR user account re-locks shortly after unlock. Suspected stale credentials.",
                3, "Account Access", 3, "Medium", "High", "P2", "Resolved", 10, 1, -26, -3
            ),
        ]

        for item in demo_tickets:
            (
                ticket_type, subject, description, requester_id, category, asset_id,
                impact, urgency, priority, status, assignee_id, escalation,
                created_offset, updated_offset
            ) = item
            created = now + timedelta(hours=created_offset)
            updated = now + timedelta(hours=updated_offset)
            rule = SLA[priority]
            response_due = created + timedelta(hours=rule["response"])
            resolution_due = created + timedelta(hours=rule["resolution"])
            first_response = created + timedelta(minutes=30) if assignee_id else None
            resolved = updated if status in {"Resolved", "Closed"} else None
            cur = conn.execute(
                """
                INSERT INTO tickets(
                    number,type,subject,description,requester_id,category,asset_id,
                    impact,urgency,priority,status,assignee_id,escalation,created_at,
                    updated_at,response_due,resolution_due,first_response_at,resolved_at,csat
                ) VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    ticket_type, subject, description, requester_id, category, asset_id,
                    impact, urgency, priority, status, assignee_id, escalation,
                    created.isoformat(), updated.isoformat(), response_due.isoformat(),
                    resolution_due.isoformat(),
                    first_response.isoformat() if first_response else None,
                    resolved.isoformat() if resolved else None,
                    5 if resolved else None,
                ),
            )
            ticket_id = int(cur.lastrowid)
            number = f"HD-{1000 + ticket_id}"
            conn.execute("UPDATE tickets SET number=? WHERE id=?", (number, ticket_id))
            requester = conn.execute("SELECT name FROM users WHERE id=?", (requester_id,)).fetchone()["name"]
            conn.execute(
                "INSERT INTO activities(ticket_id,at,actor_id,actor_name,action,note) VALUES(?,?,?,?,?,?)",
                (ticket_id, created.isoformat(), requester_id, requester, "Created ticket", description),
            )
            if assignee_id:
                tech = conn.execute("SELECT name FROM users WHERE id=?", (assignee_id,)).fetchone()["name"]
                conn.execute(
                    "INSERT INTO activities(ticket_id,at,actor_id,actor_name,action,note) VALUES(?,?,?,?,?,?)",
                    (
                        ticket_id,
                        first_response.isoformat(),
                        assignee_id,
                        tech,
                        "First response",
                        "Ticket acknowledged and triage started.",
                    ),
                )


def get_ticket(conn: sqlite3.Connection, ticket_id: int) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT t.*,
               r.name AS requester,
               COALESCE(a.name,'Unassigned') AS assignee,
               COALESCE(ci.hostname,'') AS asset
        FROM tickets t
        JOIN users r ON r.id=t.requester_id
        LEFT JOIN users a ON a.id=t.assignee_id
        LEFT JOIN assets ci ON ci.id=t.asset_id
        WHERE t.id=?
        """,
        (ticket_id,),
    ).fetchone()
    if not row:
        raise KeyError(ticket_id)

    ticket = dict(row)
    ticket["activities"] = [
        {
            "id": activity["id"],
            "at": activity["at"],
            "actor": activity["actor_name"],
            "action": activity["action"],
            "note": activity["note"],
        }
        for activity in conn.execute(
            "SELECT * FROM activities WHERE ticket_id=? ORDER BY at ASC, id ASC",
            (ticket_id,),
        ).fetchall()
    ]
    ticket["attachments"] = [
        {
            "id": attachment["id"],
            "filename": attachment["filename"],
            "size_bytes": attachment["size_bytes"],
            "uploaded_at": attachment["uploaded_at"],
            "uploaded_by": attachment["uploaded_by_name"],
        }
        for attachment in conn.execute(
            "SELECT * FROM attachments WHERE ticket_id=? ORDER BY uploaded_at ASC, id ASC",
            (ticket_id,),
        ).fetchall()
    ]
    return ticket


def bootstrap() -> dict[str, Any]:
    with db() as conn:
        users = [dict(r) for r in conn.execute("SELECT * FROM users ORDER BY id").fetchall()]
        assets = [dict(r) for r in conn.execute("SELECT * FROM assets ORDER BY hostname").fetchall()]
        ids = [r["id"] for r in conn.execute("SELECT id FROM tickets ORDER BY id DESC").fetchall()]
        tickets = [get_ticket(conn, int(ticket_id)) for ticket_id in ids]
        knowledge = []
        for row in conn.execute("SELECT * FROM knowledge ORDER BY helpful DESC, views DESC").fetchall():
            article = dict(row)
            article["tags"] = [x.strip() for x in article.pop("tags").split(",") if x.strip()]
            knowledge.append(article)
    return {
        "generated_at": utc_now(),
        "users": users,
        "assets": assets,
        "tickets": tickets,
        "knowledge": knowledge,
    }


class TicketCreate(BaseModel):
    type: str
    subject: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=3, max_length=5000)
    requester_id: int
    category: str = Field(min_length=2, max_length=80)
    asset_id: int | None = None
    impact: str
    urgency: str
    priority: str


class TicketUpdate(BaseModel):
    status: str
    priority: str
    assignee_id: int | None = None
    escalation: int = Field(default=0, ge=0, le=3)


class CommentCreate(BaseModel):
    author_id: int
    note: str = Field(min_length=1, max_length=5000)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="HelpDesk Pro API",
    version="1.0.0",
    description="Local IT Service Desk backend for HelpDesk Pro.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8790",
        "http://localhost:8790",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def api_health():
    return {"ok": True, "service": "HelpDesk Pro", "database": str(DB_PATH)}


@app.get("/api/bootstrap")
def api_bootstrap():
    return bootstrap()


@app.get("/api/tickets/{ticket_id}")
def api_ticket(ticket_id: int):
    with db() as conn:
        try:
            return get_ticket(conn, ticket_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Ticket not found.") from exc


@app.post("/api/tickets")
def api_create_ticket(request: TicketCreate):
    if request.priority not in SLA:
        raise HTTPException(status_code=400, detail="Invalid priority.")

    now = datetime.now(timezone.utc)
    rule = SLA[request.priority]

    with db() as conn:
        requester = conn.execute("SELECT * FROM users WHERE id=?", (request.requester_id,)).fetchone()
        if not requester:
            raise HTTPException(status_code=400, detail="Requester not found.")
        if request.asset_id is not None and not conn.execute("SELECT 1 FROM assets WHERE id=?", (request.asset_id,)).fetchone():
            raise HTTPException(status_code=400, detail="Asset not found.")

        cur = conn.execute(
            """
            INSERT INTO tickets(
                number,type,subject,description,requester_id,category,asset_id,
                impact,urgency,priority,status,assignee_id,escalation,created_at,
                updated_at,response_due,resolution_due
            ) VALUES(NULL,?,?,?,?,?,?,?,?,?,'New',NULL,0,?,?,?,?)
            """,
            (
                request.type, request.subject.strip(), request.description.strip(),
                request.requester_id, request.category, request.asset_id,
                request.impact, request.urgency, request.priority,
                now.isoformat(), now.isoformat(),
                (now + timedelta(hours=rule["response"])).isoformat(),
                (now + timedelta(hours=rule["resolution"])).isoformat(),
            ),
        )
        ticket_id = int(cur.lastrowid)
        number = f"HD-{1000 + ticket_id}"
        conn.execute("UPDATE tickets SET number=? WHERE id=?", (number, ticket_id))
        conn.execute(
            "INSERT INTO activities(ticket_id,at,actor_id,actor_name,action,note) VALUES(?,?,?,?,?,?)",
            (
                ticket_id, now.isoformat(), request.requester_id, requester["name"],
                "Created ticket", request.description.strip(),
            ),
        )
        conn.commit()
        return get_ticket(conn, ticket_id)


@app.put("/api/tickets/{ticket_id}")
def api_update_ticket(ticket_id: int, request: TicketUpdate):
    if request.priority not in SLA:
        raise HTTPException(status_code=400, detail="Invalid priority.")

    now = datetime.now(timezone.utc)

    with db() as conn:
        current = conn.execute("SELECT * FROM tickets WHERE id=?", (ticket_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Ticket not found.")

        assignee_name = "Unassigned"
        if request.assignee_id is not None:
            assignee = conn.execute(
                "SELECT * FROM users WHERE id=? AND role IN ('Technician','Administrator')",
                (request.assignee_id,),
            ).fetchone()
            if not assignee:
                raise HTTPException(status_code=400, detail="Assignee is not a service desk technician.")
            assignee_name = assignee["name"]

        first_response = current["first_response_at"]
        if request.assignee_id is not None and not first_response:
            first_response = now.isoformat()

        resolved_at = current["resolved_at"]
        if request.status in {"Resolved", "Closed"} and not resolved_at:
            resolved_at = now.isoformat()
        elif request.status not in {"Resolved", "Closed"}:
            resolved_at = None

        conn.execute(
            """
            UPDATE tickets SET
                status=?,priority=?,assignee_id=?,escalation=?,updated_at=?,
                first_response_at=?,resolved_at=?
            WHERE id=?
            """,
            (
                request.status, request.priority, request.assignee_id,
                request.escalation, now.isoformat(), first_response,
                resolved_at, ticket_id,
            ),
        )

        actor_id = request.assignee_id or 10
        actor = conn.execute("SELECT name FROM users WHERE id=?", (actor_id,)).fetchone()
        actor_name = actor["name"] if actor else "Service Desk"
        note = (
            f"Status {current['status']} → {request.status}; "
            f"priority {current['priority']} → {request.priority}; "
            f"assignee {assignee_name}; escalation L{request.escalation}."
        )
        conn.execute(
            "INSERT INTO activities(ticket_id,at,actor_id,actor_name,action,note) VALUES(?,?,?,?,?,?)",
            (ticket_id, now.isoformat(), actor_id, actor_name, "Ticket updated", note),
        )
        conn.commit()
        return get_ticket(conn, ticket_id)


@app.post("/api/tickets/{ticket_id}/comments")
def api_add_comment(ticket_id: int, request: CommentCreate):
    now = utc_now()
    with db() as conn:
        if not conn.execute("SELECT 1 FROM tickets WHERE id=?", (ticket_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Ticket not found.")
        author = conn.execute("SELECT * FROM users WHERE id=?", (request.author_id,)).fetchone()
        if not author:
            raise HTTPException(status_code=400, detail="Author not found.")
        conn.execute(
            "INSERT INTO activities(ticket_id,at,actor_id,actor_name,action,note) VALUES(?,?,?,?,?,?)",
            (ticket_id, now, request.author_id, author["name"], "Work note", request.note.strip()),
        )
        conn.execute("UPDATE tickets SET updated_at=? WHERE id=?", (now, ticket_id))
        conn.commit()
        return get_ticket(conn, ticket_id)



@app.post("/api/tickets/{ticket_id}/attachments")
async def api_upload_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    author_id: int = Form(10),
):
    with db() as conn:
        if not conn.execute("SELECT 1 FROM tickets WHERE id=?", (ticket_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Ticket not found.")
        author = conn.execute("SELECT * FROM users WHERE id=?", (author_id,)).fetchone()
        if not author:
            raise HTTPException(status_code=400, detail="Uploader not found.")

        original_name = Path(file.filename or "attachment.bin").name
        safe_name = "".join(ch for ch in original_name if ch.isalnum() or ch in "._- ").strip()
        if not safe_name:
            safe_name = "attachment.bin"

        content = await file.read(MAX_ATTACHMENT_BYTES + 1)
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=413, detail="Attachment exceeds the 5 MB limit.")

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        stored_name = f"{ticket_id}_{stamp}_{safe_name}"
        (UPLOAD_DIR / stored_name).write_bytes(content)

        now = utc_now()
        cur = conn.execute(
            """
            INSERT INTO attachments(
                ticket_id,filename,stored_name,size_bytes,uploaded_at,
                uploaded_by,uploaded_by_name
            ) VALUES(?,?,?,?,?,?,?)
            """,
            (
                ticket_id, safe_name, stored_name, len(content), now,
                author_id, author["name"],
            ),
        )
        conn.execute(
            "INSERT INTO activities(ticket_id,at,actor_id,actor_name,action,note) VALUES(?,?,?,?,?,?)",
            (
                ticket_id, now, author_id, author["name"],
                "Attachment added", safe_name,
            ),
        )
        conn.execute("UPDATE tickets SET updated_at=? WHERE id=?", (now, ticket_id))
        conn.commit()
        attachment_id = int(cur.lastrowid)

    return {
        "id": attachment_id,
        "filename": safe_name,
        "size_bytes": len(content),
        "uploaded_at": now,
        "uploaded_by": author["name"],
    }


@app.get("/api/attachments/{attachment_id}")
def api_download_attachment(attachment_id: int):
    with db() as conn:
        row = conn.execute("SELECT * FROM attachments WHERE id=?", (attachment_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Attachment not found.")
        path = UPLOAD_DIR / row["stored_name"]
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Attachment file is missing.")
        return FileResponse(path, filename=row["filename"], media_type="application/octet-stream")


@app.get("/")
def ui():
    return FileResponse(ROOT / "index.html")


@app.get("/styles.css")
def styles():
    return FileResponse(ROOT / "styles.css", media_type="text/css")


@app.get("/demo-data.js")
def demo_data():
    return FileResponse(ROOT / "demo-data.js", media_type="application/javascript")


@app.get("/app.js")
def app_js():
    return FileResponse(ROOT / "app.js", media_type="application/javascript")


def main() -> None:
    import uvicorn
    print("HelpDesk Pro live backend: http://127.0.0.1:8790")
    uvicorn.run(app, host="127.0.0.1", port=8790, log_level="info")


if __name__ == "__main__":
    main()
