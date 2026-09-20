# Molong 🦭 — a chatbot that remembers (Walrus Sessions 8)

Multi-tenant chatbot with **cross-session, cross-device** long-term memory built on
**Walrus Memory (MemWal)**. Live on **Sui mainnet** via the Walrus Foundation public
relayer (`relayer.memory.walrus.xyz`). The brain is a non-OpenAI/Anthropic model
(`ling-3.0-flash` via an OpenAI-compatible gateway) → qualifies for the
**"Beyond the Big Two"** category.

> "Build something that doesn't forget. 🦭🧠"

## Live
- **Public demo:** `https://hosted-electronic-beaches-southampton.trycloudflare.com`
  (Cloudflare quick tunnel → Express:8090; served from Singapore edge)
- **Memory backend:** Walrus mainnet, encrypted at rest (SEAL), per-user namespace.

## What it does
- Remembers a user's identity, preferences, facts, goals across **many sessions and
  devices** (any browser hitting the same URL sees the same memory — no login, keyed
  by a user id).
- Each turn it **recalls** top-K relevant long-term memories (semantic vector search)
  and weaves them into the reply.
- Each turn it **remembers** a distilled, durable fact about the user, encrypted at
  rest (SEAL) and stored on Walrus mainnet blobs.
- **Tenant isolation:** each user id → its own Walrus `namespace`; one user's memory is
  never recalled into another's.

## Verified on mainnet (2026-09-20)
| Check | Result |
|---|---|
| `remember` → mainnet blob (SEAL-encrypted) | ✅ job confirmed |
| `recall` across a "new session" (semantic) | ✅ `memoriesRecalled=2`, answered name/profession/preference from memory |
| Cross-tenant isolation (user `siti` asked about `rio-test`) | ✅ 0 leak — bot had nothing on that user |
| Relayer health | ✅ `write_ready:true` |

## Stack
| Layer | Choice |
|---|---|
| Memory | `@mysten-incubation/memwal` v0.1.7 → Walrus Memory (Sui mainnet, public relayer `relayer.memory.walrus.xyz`) |
| Encryption | SEAL (ED25519 delegate key, at-rest encryption on Walrus blobs) |
| Orchestration | Node 20+ / Express, single file |
| LLM | `ling-3.0-flash` via `je.jerouter.web.id` (OpenAI-compatible, **not** OpenAI/Anthropic) |
| Frontend | static single-page chat UI |
| Edge | Cloudflare quick tunnel |

## Architecture
```
Browser ──(user id + text)──▶ molong (Express)
                                 │
        ┌────────────────────────┴───────────────────────────┐
        │ 1. recall(query, namespace=user)  ◀── Walrus Memory │  semantic top-K
        │ 2. LLM reply with recalled memories in system prompt│  ling-3.0-flash
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
- `GET  /api/memory?user=<id>` — list what the bot remembers for that user (`restore`)
- `GET  /api/health` — relayer + model status
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
- ✅ Deployed and in use (multi-day window, deadline 9 Oct 14:00 UTC)
- 📝 Article on integration & usage results — in progress
- 📣 Post on X with `#WalrusMemory` — in progress
- ✅ Submit repo + model used (`ling-3.0-flash`) + bugs found + improvement ideas

## Bugs found / improvement ideas
- **Timeout behavior:** the public relayer's `remember` job + `recall` can each take
  tens of seconds under load; the app ships a `Promise.race` cap on `restore` and
  background (fire-and-forget) memory writes so the reply is never held up by the
  memory layer.
- `qwen3.8-27b` was flaky/slow via the gateway for this use case; `ling-3.0-flash`
  (~3s) replaced it with better memory-note extraction quality.
- Single-operator namespace multiplexing: move per-user keys on-chain for a stronger
  trust boundary (delegate key per user) instead of one operator key + namespaces.
- Add `POST /api/chat/stream` SSE for token streaming.
- Recall re-ranking + forgetting (decay / `restore`-then-prune) for long histories.
- Idempotency keys on `remember` to dedupe repeated facts.
