# Molong 🦭 — a chatbot that remembers (Walrus Sessions 8)

Multi-tenant chatbot with **cross-session, cross-device** long-term memory built on
**Walrus Memory (MemWal)**. It is live on **Walrus mainnet** through the public
relayer. The primary model is declared as `ling-3.0-flash-fin` (InclusionAI
model lineage) through an OpenAI-compatible Jerouter runtime. The gateway's upstream
routing should be confirmed before making a provider-eligibility claim.

> "Build something that doesn't forget." 🦭🧠

## Live

- **Public demo:** `https://banana-another-varying-indicates.trycloudflare.com`
- **Support demo:** `https://banana-another-varying-indicates.trycloudflare.com/support.html`
- **Source and setup:** https://github.com/dandypst/molong
- **Deployment evidence:** `DEPLOYMENT.md`
- **Memory backend:** Walrus mainnet, SEAL-encrypted, per-user namespace. The local `pending_notes.json` file is only a permission-protected retry buffer; it is never used for recall.
- **Runtime:** Node `26.7.0`, Express, MemWal `0.1.7`.

The Cloudflare URL is a quick tunnel and changes after a restart.

## What it does
- Remembers a user's identity, preferences, facts, goals across **many sessions and
  devices** (any browser hitting the same URL sees the same memory — no login, keyed
  by a user id).
- Each turn it **recalls** top-K relevant long-term memories (semantic vector search)
  and weaves them into the reply.
- Each turn it **remembers** a distilled, durable fact about the user, encrypted at
  rest (SEAL) and stored on Walrus mainnet blobs.
- **Tenant separation:** each user id maps to a distinct Walrus `namespace`; a
  different namespace recalled nothing in the live isolation test. The user id is
  client-supplied and is **not authentication**—do not treat this demo as an
  authorization boundary.

## Verified on mainnet (2026-09-21)

| Check | Result |
|---|---|
| `remember` → mainnet blob | ✅ job confirmed |
| `recall` across a fresh request | ✅ `memoriesRecalled=1`; answer used stored name/preference |
| `/api/memory` | ✅ returned `Rio Public is a user who prefers concise answers.` |
| Cross-tenant isolation | ✅ different user returned `memoriesRecalled=0` |
| Relayer health | ✅ `status=ok`, `write_ready=true` |
| Blob evidence | ✅ 16 account blobs; 11 application blobs after excluding `verify-*` |
| Delegate key integrity | ✅ derived public key matches provided public key |

## Stack
| Layer | Choice |
|---|---|
| Memory | `@mysten-incubation/memwal` v0.1.7 → Walrus Memory (Sui mainnet, public relayer `relayer.memory.walrus.xyz`) |
| Encryption | SEAL (ED25519 delegate key, at-rest encryption on Walrus blobs) |
| Orchestration | Node 20+ / Express, modular server + memory-note helper |
| LLM | `ling-3.0-flash-fin` (InclusionAI lineage) via `je.jerouter.web.id` (OpenAI-compatible runtime; upstream routing is not exposed) |
| Frontend | static single-page chat UI |
| Edge | Cloudflare quick tunnel |

## Architecture
```
Browser ──(user id + text)──▶ molong (Express)
                                 │
        ┌────────────────────────┴───────────────────────────┐
        │ 1. recall(query, namespace=user)  ◀── Walrus Memory │  semantic top-K
        │ 2. LLM reply with recalled memories as untrusted user context       │  ling-3.0-flash-fin
        │ 3. LLM distill "memory note" ─▶ remember(note, ns)   │  SEAL-encrypt → mainnet blob
        │    (runs in the background so the reply is fast)      │
        └─────────────────────────────────────────────────────┘
```
One **operator** Walrus account; every user id maps to its own `namespace` (Memory
Space), so the single shared relayer deployment still isolates each user's data.

## Run
```bash
npm install
# 1) operator credentials (accountId + delegate key) from the Walrus Memory Playground
#    https://memory.walrus.xyz  →  creds_mainnet.json   (mainnet)  or  creds_testnet.json
# 2) LLM key
cp .env.example .env   # fill LLM_API_KEY
# 3) start
PORT=8090 node membot.mjs
```
Dev without a chain (in-memory mock, same SDK surface):
```bash
USE_MOCK=1 PORT=8091 node membot.mjs
```
Endpoints:
- `POST /api/chat {text, user}` — recall → reply → remember
- `GET  /api/memory?user=<id>` — broad semantic recall of stored facts for that user
- `GET  /api/health` — relayer + model status
- API rate limit: 30 requests/minute per source IP (source; restart required for the running demo)
- static UI at `/`

## Verification
- `verify_memory.mjs` — proves the memory layer end-to-end (store → semantic recall →
  cross-tenant isolation → restore) without depending on the LLM.
- `verify_mainnet.mjs` — same, but against the real mainnet relayer with the operator
  creds; also checks the delegate key's public key matches.
- Live flow: `POST /api/chat` establishes a fact → a later, independent turn recalls it
  and answers using it (see "Verified on mainnet" table above).

## Competition mapping (Walrus Sessions 8)
- ✅ Chatbot using Walrus Memory on **mainnet** (public relayer) — live
- ✅ Deployed and reachable; real-user usage evidence still needed before submit
- ✅ Model/runtime disclosed; gateway upstream is not exposed, so no unverified provider is claimed
- 📝 Article draft complete in `ARTICLE.md`; publication pending
- 📣 Share the published article on X tagging `@WalrusProtocol` under the session announcement using `#WalrusMemory` — pending
- ✅ Agent ID and blob count prepared; public repo published at https://github.com/dandypst/molong; submit form pending required inputs
- 📋 DeepSurge also requests evidence of at least 3 users with at least 10 memories each

## Bugs found / improvement ideas
- **Timeout behavior:** the public relayer's `remember` job + `recall` can each take
  tens of seconds under load; request-path calls are capped with `Promise.race`, while
  memory writes run in the background so the reply is not held by write confirmation.
- `qwen3.8-27b` was flaky/slow via the gateway for this use case; `ling-3.0-flash-fin`
  (~3s) replaced it with better memory-note extraction quality.
- Single-operator namespace multiplexing: move per-user keys on-chain for a stronger
  trust boundary (delegate key per user) instead of one operator key + namespaces.
- Add `POST /api/chat/stream` SSE for token streaming.
- Recall re-ranking + forgetting (decay / `restore`-then-prune) for long histories.
- Idempotency keys on `remember` dedupe repeated facts and let restart recovery resume
  the same accepted job where possible.
