# Approval-based AI tool calling

Implemented October 13, 2026 for authenticated Cloud Workspace owners.

## Demo workflow

1. Sign in as the workspace owner and open a saved Service Desk ticket.
2. Click **AI Propose Work Note**. Limited ticket context is sent to Gemini; do not use sensitive demo data.
3. Review the exact tool name, ticket, note, model and expiry. The ticket has not changed.
4. Click **Approve & Add Note**. The server validates ownership, expiry and workspace version, then atomically adds the note and an audit event.
5. Reopen the ticket or refresh cloud data to confirm the saved activity. Show the AI Tools audit event.
6. Generate a second proposal and click **Reject** to demonstrate the no-action path.

Use **Pending Tool Proposals** to resume a review after closing the ticket. The panel lists the five most recent pending proposals. Proposals expire after 15 minutes. Any intervening workspace save makes an older proposal stale; generate a fresh proposal. A repeated approval returns its existing result without adding another note.

## Implementation and boundaries

Gemini native function calling proposes only `add_work_note(note)`. The server supplies the target ticket and workspace, rejects unknown tools or extra arguments, and stores immutable proposal arguments. The model cannot call the approval RPC. Approval requires a signed-in owner action; the client sends only proposal ID and approve/reject, never replacement tool arguments.

`opsfusion-ai-tools` is a separate JWT-protected Edge Function. Existing read-only AI analysis remains available. PostgreSQL row locks, workspace version checks and a single transaction protect execution. Authenticated clients can read their own proposals through RLS but cannot insert or update them directly. The approval RPC intentionally uses SECURITY DEFINER with an empty search path and explicit identity/ownership checks; Supabase's advisory warning for authenticated execution is expected for this narrowly scoped endpoint.

This tool writes a proposed plan as a work note. It does not prove that recommended checks happened, change ticket status, execute shell commands, control devices, or send external messages. Approval demonstrates human-controlled AI action, not autonomous remediation.

## Verification evidence

- 129 Node tests passed locally, including 11 new mocked native-tool response tests covering valid proposals, authentication, ownership, missing tickets, quota, unknown tools, extra arguments, multiple calls, empty/overlong notes and blocked responses.
- `tests/approval-database.sql` passed against the configured database inside a rolled-back transaction: proposal-only behavior, wrong-owner denial, approval, duplicate prevention, audit creation, expiry, stale versions, rejection and privileges. Existing records were not changed by these tests.
- Database test identity claims are exercised under the SQL test connection; they do not substitute for separate signed-in browser sessions.
- A live owner-browser Gemini proposal-to-approval rehearsal is still required before claiming complete end-to-end verification.

## Deployment

Apply `supabase/approval-tools.sql` once to a provisioned OpsFusion database, deploy `supabase/functions/opsfusion-ai-tools/index.ts` with JWT verification enabled and the existing server-side Gemini configuration, then publish app.js, cloud.js and index.html. Do not rerun the schema file on an already provisioned deployment.

Rehearsal script: “The model proposes a specific tool call. Nothing changes until I review the exact arguments and approve. The server checks my permissions and executes once, recording the result in the audit trail.”
