# Molong deployment evidence

## Vercel deployment (target, 2026-09-26)

Port of the demo to Vercel Node Functions so the public URL is stable
(`*.vercel.app`) instead of an ephemeral quick tunnel.

### Structure
- `api/chat.mjs`, `api/memory.mjs`, `api/health.mjs` — Vercel Functions (default export,
  Node.js runtime, auto-detected from the repo root).
- `lib/relayer.mjs` — MemWal client factory: creds from env
  (`WALRUS_ACCOUNT_ID` + `WALRUS_DELEGATE_KEY`), `CREDS_FILE`, or `creds_*.json`
  (local only; `creds_*.json` is gitignored and not shipped).
- `lib/llm.mjs` — OpenAI-compatible LLM client (env `LLM_API_KEY`, `LLM_BASE_URL`,
  `LLM_MODEL`); `.env` is read as a local fallback only — real env always wins.
- `lib/http.mjs` — CORS, per-IP source extraction, lazy shared client with health
  gate (Eisberg-style reuse across invocations; no writes to the filesystem —
  Vercel's FS is read-only, so the local pending-notes queue does not exist here).
- `vercel.json` — `maxDuration`: `/api/chat` 60s, `/api/memory` 60s, `/api/health` 30s;
  `buildCommand` is a syntax check only (no npm build, deps resolved from
  `node_modules` in the repo — keep `package-lock.json` + `node_modules` in sync).
- `membot.mjs` — the local Express build, refactored to share `lib/`; still runnable
  via `npm start` with a local `.env` (local evidence path unchanged).

### Serverless deltas (documented, not regressions)
- The local fire-and-forget background remember is an in-request `remember()` +
  bounded job confirmation; idempotency keys keep retries from duplicating blobs.
- LLM caps tightened (recall 8s, 2 x 14s reply attempts, 12s extraction, 10s job
  confirm) to fit the 60s function budget.
- The per-IP rate limiter is per-function-instance (in-memory), best-effort.
- `USE_MOCK` exists for local testing only; the deployed build uses the real relayer.

### Local verification (2026-09-26, before the Vercel import)
- `npm run check`: all 11 files pass syntax check.
- `npm test`: 8/8 pass.
- `USE_MOCK=1 node smoke_vercel.mjs`: simulates Function invocations —
  `/api/health` 200 ok; `/api/chat` recall+reply+remember; `/api/memory` lists;
  validation 400/405; rate limit 429 with Retry-After.
- Refactored local Express server boots with `USE_MOCK=1` and answers
  `/api/health`, `/api/chat` (real LLM), `/api/memory`.
- Secret scan over all staged files: no matches.

### What still has to happen (NOT yet done)
- Import `dandypst/molong` into Vercel and set env vars:
  `WALRUS_ACCOUNT_ID`, `WALRUS_DELEGATE_KEY`, `LLM_API_KEY`
  (defaults: `LLM_BASE_URL=https://je.jerouter.web.id/v1`,
  `LLM_MODEL=ling-3.0-flash-fin`).
- Relayer auth was down (`401`/`503 AUTH_UPSTREAM_UNAVAILABLE`, since 2026-09-22,
  GitHub MystenLabs/MemWal issue #980) at the time of writing: until it recovers,
  the live function will 503 with `relayer unavailable` by design (fail-fast,
  same as the local build). No re-deploy needed when auth recovers.

## Legacy local/quick-tunnel run (verified 2026-09-21 06:00 WIB, superseded)

- Public demo: https://banana-another-varying-indicates.trycloudflare.com
- Support demo: https://banana-another-varying-indicates.trycloudflare.com/support.html
- Node process: PID 605059, bound to `0.0.0.0:8090`
- Tunnel: existing Cloudflare quick tunnel to `http://127.0.0.1:8090`
- Health response: `{"ok":true,"relayer":"ok","write_ready":true,"model":"ling-3.0-flash-fin"}`
- Root page: HTTP 200
- Support page: HTTP 200

### Functional evidence
- A synthetic preference was stored through `POST /api/chat`.
- A later independent request recalled it with `memoriesRecalled=1`.
- `/api/memory` returned the stored fact for the original namespace.
- A different namespace returned `memoriesRecalled=0`.
- The support endpoint accepted `role:"support"` and used the separate support namespace.

### Mainnet evidence
- `node verify_mainnet.mjs`: key integrity passed; health `ok`; `write_ready=true`; write job confirmed; recall found the stored fact.
- `node count_namespaces.mjs`: 16 account blobs total; 11 application blobs after excluding `verify-*` namespaces.

### Automated gates
- `npm test`: 8/8 passed.
- `npm run check`: all JavaScript syntax checks passed, including `rate_limit.mjs`.
- `git diff --check`: passed.
- Added-line secret scan: no matches.
- Public HTML unsafe HTML sink scan (`innerHTML`, `insertAdjacentHTML`, `eval`, `Function`): no matches.
- Source includes an API rate limit of 30 requests/minute per source IP; restart the public process before claiming it is active.

### Limits
- The Cloudflare quick-tunnel URL is ephemeral and changes after tunnel restart.
- The client-supplied user id is not authenticated; namespaces separate data but are not an authorization boundary.
- The local retry queue is transient operational state, never used for recall or exposed as a memory database.
- This deployment is ready for review, not submitted. Tedjo approved the form submission on 2026-09-21 and confirms the 3-user/10-memory threshold; article publication, evidence attachments, feedback/Discord/X actions, and remaining form inputs are still pending.
