# OpsFusion Gemini AI Service Desk — Deployment and Acceptance

Updated 2026-10-12. OpsFusion is configured to use **Google Gemini** as its only AI provider, replacing the OpenAI API integration. Free-tier-eligible model: `gemini-2.5-flash-lite`. Model access and per-project rate limits vary. See [official Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) and [billing tiers](https://ai.google.dev/gemini-api/docs/billing).

## Provider activation — private Google API key

**Do not send Gemini keys through ChatGPT, browser JavaScript, GitHub, Vercel, or public support tickets.**

1. Open [Google AI Studio's API keys page](https://aistudio.google.com/apikey). Sign in with your Google account. Create or choose a **free-tier** Google AI project with no enabled billable Gemini API plan (or use its existing suitable project), and generate a Gemini API key. Google Cloud/AI Studio API projects and their rate limits are account-specific.
2. In the existing [OpsFusion Supabase project](https://supabase.com/dashboard/project/qyizwyvgbywkextsekpj), navigate to **Edge Functions → Secrets**.
3. Add a secret named **`GEMINI_API_KEY`**, with the key's complete value entered **only in Supabase**. Save. Google API keys must never be included in client code.
4. No OpenAI key is required. `OPENAI_API_KEY` is no longer read by this deployed Edge Function. Do not delete existing unrelated secrets without reviewing dependencies; no test data resets are authorized.
5. Refresh [OpsFusion production](https://opsfusion-it.vercel.app/) (Ctrl+Shift+R), sign in as the owner of the populated workspace, and go to **Service Desk → INC-1003 → Details → AI Analyze Ticket**.
6. Before sending a ticket to Google, read the disclosure. Free-tier prompts and responses **may be used to improve Google products**. Only submit nonsensitive demonstration tickets. Do not include confidential business content, personal details, passwords, tokens, internal secrets, or live production diagnostics.
7. The response should identify provider **Google Gemini** and model **gemini-2.5-flash-lite**, and include a summary, tentative causes, recommended checks, suggested category/priority, limitations, and a *draft* work note.
8. Clicking Analyze **does not modify tickets or endpoints**. You must select **Insert Draft Into Work Note**, review/edit the draft, and click **Add Work Note** to save. No automated resolutions, endpoint commands, or AI-verified diagnoses are performed.
9. Check that the ticket timeline updates after saving and survives Refresh Cloud Data. Sign in to another account; it must only see its own workspace and never another workspace's AI data.

**Live AI status is pending** until the user configures `GEMINI_API_KEY` and the authenticated browser makes a successful real Gemini response. Simulated unit test output does not count as an actual AI API call.

## Current security and safeguards

- Supabase Edge Function: `opsfusion-ai-assistant` deployed with `verify_jwt: true`.
- Browser sends only ticket ID and workspace UUID to the function. The function verifies the JWT and **workspace owner** before retrieving a ticket from Supabase.
- Gemini text API: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent` with `x-goog-api-key` authorization and structured JSON generation.
- An atomic private Postgres quota restricts AI usage to **15 requests per user per hour**. The function reports rate-limit or provider errors; it never fabricates a successful response when the provider fails.
- Ticket context is truncated; obvious email addresses and token-like strings are redacted on a **best-effort basis only**. This is not a guarantee that all sensitive information has been removed.
- Only authenticated workspace owners can request AI; viewer accounts and unrelated workspaces cannot.
- AI remains **read-only** until a technician explicitly inserts and saves their note. No ticket or cloud data is altered by the AI endpoint.
- The **Gemini API Free Tier** is a Google account/project billing configuration; OpsFusion cannot force a paid-tier API project to be free. A paid project may incur charges if used. Use a free-tier project and monitor its usage in AI Studio.
- `OPENAI_API_KEY` is obsolete for this function. Never copy a Google secret under that name.
- No service desk or automation test records were deleted, reset, or replaced.

## Troubleshooting

- `AI_NOT_CONFIGURED`: `GEMINI_API_KEY` missing from Supabase Edge Functions Secrets.
- `AUTH_REQUIRED` / `ACCESS_DENIED`: expired sign-in or ticket/workspace access failure.
- `TICKET_NOT_FOUND`: selected ticket not in this owner's workspace.
- `AI_PROVIDER_UNAVAILABLE`: Google API key invalid, model inaccessible, or project not eligible.
- `AI_PROVIDER_RATE_LIMIT`: Google free-tier rate limit exhausted; wait until reset.
- `AI_RATE_LIMIT`: per-user OpsFusion limit of 15 requests in the same UTC hour.
- `AI_INCOMPLETE`: no safe completed model response; no advice shown.
- For the current Supabase security advisor, leaked-password protection is still a separate admin setting; do not present this AI migration as resolving it.

## Completion bar

- Backend/GUI/GitHub changes committed; production Vercel deployment READY and Edge Function active.
- Automated regression tests and source-level runtime mocks pass.
- In Supabase, the original two accounts and two workspaces, service desk tickets, audit history, and hourly automation remain intact.
- **Must verify a real signed-in Gemini API request and its output after the user privately adds the key.**
