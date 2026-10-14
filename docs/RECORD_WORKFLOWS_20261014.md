# Record workflow completion — 14 October 2026

- Endpoints: open a record, select Edit Endpoint, update inventory fields and save. Assigned asset ownership takes precedence over manual owner changes. Switch renames update port mappings. Agent and telemetry fields are not editable.
- Assets: open a record, choose Link endpoint and save. Existing assets can be linked, relinked or unlinked. A changed link cannot claim an endpoint already linked to another asset. Existing tickets retain their recorded endpoint; new asset tickets use the updated link.
- Knowledge Base: New Article creates a support article with category, summary and full text. Search includes full text. Edit Article supports updates and reversible archiving. Show archived articles includes archived records for restoration. Active articles also appear in Service Desk.
- Network Documentation remains a separate navigation item for topology and port records.

These changes use the existing workspace save queue, optimistic concurrency checks and role restrictions. Viewers cannot save. Failed saves retain the form for correction. Cloud records are saved through the existing Supabase workspace API; demo records remain browser-local. Ordinary audit writes follow the record save and are not an atomic transaction with it.

Validation: all 140 Node tests pass, including 11 new record-workflow tests covering invalid input, duplicate identifiers, relationship preservation, agent-field protection, asset links, and knowledge lifecycle validation.

No existing account or workspace data is reset or migrated. This release does not implement real endpoint agents, live remote device control, shared-company onboarding, or additional AI tools. Signed-in cloud UI acceptance still requires an authenticated session.
