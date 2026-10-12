# OpsFusion AI Service Desk Assistant — Deployment and Acceptance

## What is implemented

OpsFusion's real, opt-in AI assistance appears inside the existing Service Desk ticket details dialog, **only in an authenticated Cloud Workspace owned by the current Supabase user**. The AI backend is Supabase Edge Function `opsfusion-ai-assistant` (`verify_jwt: true`). The model is `gpt-4.1-mini` using OpenAI Responses API structured JSON output.

The browser transmits **only the workspace ID and ticket ID**. The backend validates the user's JWT with Supabase Auth, retrieves the ticket from that user's owned Supabase workspace (not from client-supplied ticket text), applies an atomic quota of **15 requests per user per hour**, and calls the AI API with ticket title, type, description, category, priority, impact, urgency, status, and the last three work notes (size-limited and best-effort redacted). Origin restrictions allow only `https://opsfusion-it.vercel.app`.

AI provides a summary, **possible** causes, **recommended** checks, category/priority suggestions, and a draft work note. The user must explicitly insert, review, edit, and click **Add Work Note** for persistence. AI cannot run commands, read live network telemetry, access other accounts' tickets, update tickets automatically, or reset passwords. OpenAI requests set `store:false`, although third-party retention and usage rules still apply.

## Required manual activation (private secret)

**Never paste an API key into ChatGPT, GitHub, frontend JavaScript, or the Vercel static site.**

1. Create an API key from the OpenAI developer platform: https://platform.openai.com/api-keys. API billing is separate from ChatGPT subscription billing; ensure the key's project has model and billing access.
2. Open the existing OpsFusion Supabase project https://supabase.com/dashboard/project/qyizwyvgbywkextsekpj and navigate to **Edge Functions → Secrets** (location may also be under Project Settings → Edge Functions).
3. Add a **production Edge Function Secret** with name exactly `OPENAI_API_KEY` and paste the key value **only into Supabase**. Save.
4. You normally do not need to redeploy the Edge Function after setting a secret. See https://supabase.com/docs/guides/functions/secrets.
5. Open https://opsfusion-it.vercel.app/ and hard-refresh (Ctrl+Shift+R), sign in as the account that owns the ticket, select **Service Desk → INC-1003 → Details → AI Analyze Ticket**. Review the notice about sending text to a third-party AI provider **before clicking**.
6. Expect structured real generated suggestions and a `gpt-4.1-mini` model label. Click **Insert Draft Into Work Note** to populate an *unsaved* note, edit it, and only click **Add Work Note** after reviewing. Do not claim execution of hypothetical checks.
7. Reopen the ticket and verify notes persist only if explicitly saved. Confirm that merely clicking AI Analyze does **not** change the ticket state, audit history, or endpoint.
8. Sign in to a different owned workspace and try only its own ticket. Ensure the original owner's tickets are not visible. Network attempts to analyze another owner's workspace must return 403.

## Failure messages

- `AI_NOT_CONFIGURED`: Supabase Edge Function secret `OPENAI_API_KEY` is absent. The endpoint exists but inference is not activated.
- `AUTH_REQUIRED` / `ACCESS_DENIED`: invalid login, missing ticket access, or current user not the workspace owner.
- `AI_RATE_LIMIT`: 15 AI requests already used in the active UTC hour.
- `AI_PROVIDER_UNAVAILABLE`: provider rejected the request; verify OpenAI key, API billing, model access. Never expose raw credentials or provider error bodies to users.
- `AI_UNAVAILABLE`: time-out or temporary error; existing Service Desk workflows remain operational.

## Security notes and current limitations

- The Edge Function uses Supabase's server-side service-role credential to authorize and read only the user-owned workspace after JWT validation. Never import it into browser code.
- `opsfusion_private.ai_request_quotas` is not exposed to clients. The atomic quota RPC `public.opsfusion_ai_consume_quota(uuid)` grants EXECUTE **only** to service_role; `anon` and `authenticated` cannot execute it.
- Input redaction is best-effort, not a guarantee that ticket descriptions contain no sensitive data. Only use non-sensitive demonstration tickets.
- The UI provides **AI advice, not observed diagnostics, actual remediation, or verified AI accuracy**.
- Genuine Windows agent monitoring and AI-predicted hardware failures are not part of this integration.
- The user has not authorized a final data reset. **Never delete** test accounts, previous workspace records, audits, alerts, backup data, RLS, or scheduled automations without explicit approval after backup.
- Supabase Auth leaked-password protection is a separate remaining security configuration item; it is not changed by this feature.

## Release acceptance requirements

- Edge Function deployed with JWT verification enabled.
- SQL quota denies direct anon/authenticated callers but permits service_role.
- All existing automated and AI-specific tests pass.
- Vercel production is READY for the expected GitHub commit SHA and aliases to the current public site.
- **Live AI is not marked as operational until the private key is configured and an authenticated request returns a genuine provider-generated analysis.**
