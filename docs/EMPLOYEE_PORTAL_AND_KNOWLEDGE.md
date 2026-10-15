# Employee portal and Knowledge Base assistance

## Employee setup

1. Employee opens https://opsfusion-it.vercel.app/employee, registers with their company email and a password of at least 12 characters, and confirms the email if required.
2. Workspace owner creates or selects the person's active record in Identity & Access.
3. Owner opens Settings → Manage Employee Access, selects the identity and enters the confirmed account email. Grant Employee Access links the account without granting staff membership or raw workspace access.
4. Employee signs in at /employee and selects the enrolled workspace. Submit a request, view its status/priority and exchange public replies with IT. Refresh tickets retrieves the latest updates.
5. Staff opens the request in Service Desk and uses Reply visible to employee. Internal work notes, AI drafts, employee directory, other people's requests and asset inventory are not returned by the portal API. Staff's first public reply also records first response time.
6. Revoke disables enrollment immediately. Disabled or offboarded identity records also lose portal access. Existing requests remain stored for staff. Re-enrolling the same account and identity restores its portal request history.

An employee may be enrolled in more than one workspace. Only requests submitted through that account in the portal are exposed; pre-existing staff-created tickets are not automatically shared. The portal does not create a separate private workspace during registration. Registration email delivery and redirect allowlists depend on the existing Supabase Auth configuration. Password recovery uses the existing main application flow.

## Permissions and persistence

`opsfusion_employee_access` has RLS enabled with no browser table privileges. The authenticated public RPC delegates to a private implementation with explicit `auth.uid()`, owner, enrollment, active identity, workspace and ticket-owner checks. It returns a whitelist projection, never workspace state or internal work notes. No anonymous execution is granted. The RPC locks the workspace row while adding tickets/comments, preserving concurrent writes and the existing version checks for staff saves. Audit entries commit in the same database transaction as portal mutations. Staff public replies use the existing version-checked workspace save queue.

Limits: 20 new requests per employee/workspace per rolling day, 180-character titles, 4,000-character descriptions, 2,000-character replies and 100 public messages per ticket. Employees cannot change priority, requester, assignee, status or private notes. Resolved/closed conversations are read-only until staff reopen them.

## AI Knowledge Base integration

Both ticket analysis and approval-based work-note proposals retrieve up to three relevant active articles from the authorized workspace. Retrieval is deterministic keyword matching, with title weighting, bounded redacted excerpts and archived-article exclusion. No vector database is claimed. Article content is treated as untrusted reference data; prompts instruct Gemini to ignore embedded instructions, distinguish hypotheses from observations, and never claim a fix was performed.

Analysis displays server-selected article references and labels IDs actually cited by the model. Unknown citation IDs are removed. No-match results explicitly state that no relevant active articles were found. References are evidence to review, not proof that the answer is correct. AI remains workspace-owner-only. Employees cannot call owner AI tools. Approval requirements and existing quotas are retained.

## Verification and remaining acceptance

- 160 Node regression tests pass, including retrieval filtering/bounds, citation validation, provider-request context and ticket field preservation.
- `tests/employee-portal-database.sql` exercises real authenticated-role RLS and RPC authorization using rollback-only fixtures: enrollment, submission, public replies, authoritative ownership, projection, cross-workspace denial, unauthorized replies, inactive identity denial and revocation.
- Existing ordinary record workflows and AI authorization/retry/tool tests remain included.
- A signed-in browser acceptance run with an owner and employee, real confirmation email delivery, and a live Gemini response on a knowledge-backed ticket still require authorized account sessions. Automated/mocked provider tests are not a claim of live Gemini execution.

The security advisor flags the intentional authenticated definer RPC and RLS-only access table. Their access boundary is tested above. Existing leaked-password protection is disabled; this release does not change Auth configuration. References: [RPC advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
