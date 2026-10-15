# Identity and asset duplicate protection

Checks are workspace-scoped and normalize case, whitespace and Unicode compatibility characters.

- Identities: unique ID, full display name, username and UPN. Disabled and offboarded identities still reserve their identifiers. Generated usernames no longer receive numeric suffixes; collisions are rejected.
- Assets: unique ID, tag, hostname/name, meaningful serial number and linked endpoint. Empty serials and legacy placeholders are not identifiers. Shared types, departments, models and locations are allowed.
- Assigned assets must be saved as Available before assignment to a different identity. The same existing asset record should be reused.
- Existing duplicate groups are preserved, but cannot gain records. No records are deleted or merged automatically.
- Demo reset/import controls and handlers are removed. Cloud mutations validate uniqueness before committing.

Enforcement runs in the serialized browser save queue and a PostgreSQL trigger, including direct cloud API writes. Existing optimistic concurrency and access controls remain in place. Identity records are workspace personnel records, not Supabase login accounts.

Verification: 153 Node tests pass. Isolated database tests reject duplicate identity names/usernames/UPNs, asset tags/names/serials/endpoint links and direct transfers; release then assignment succeeds. All fixture writes were rolled back. Existing workspace states remain accepted in a rollback-only check.

Security advisor review found no finding on the new invoker trigger. Existing findings concern intentionally callable approval/automation definer RPCs, an RLS-only backup table, and disabled leaked-password protection; no permissions were expanded in this release. Reference: [function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [backup-table advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
