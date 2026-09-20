# Molong 🦭 — Building a Chatbot That Remembers with Walrus Memory

*Walrus Sessions 8 · #WalrusMemory*

## The problem

Most chatbots amnesia: the moment a session ends, everything is gone. A support bot
forgets the customer's name, a tutor forgets where the student got stuck, a community
assistant forgets the conventions the community agreed on last week.

We built **Molong** — a small multi-tenant chatbot that remembers users **across
sessions, across devices, on Sui mainnet**, using **Walrus Memory (MemWal)** for
long-term memory and `ling-3.0-flash` as the brain (OpenAI-compatible gateway, not
OpenAI/Anthropic).

## Why Walrus Memory

The killer feature for us: memory is **stored as encrypted (SEAL) blobs on the Walrus
network** and retrieved with **semantic vector search** — not keyword grep, not a SQL
table, not context stuffing. The app holds no memory database at all. The only
stateful thing Molong has is one operator account with a delegate key; everything the
bot learns about users lives on-chain in per-user namespaces.

That means:

- **Cross-device** for free — a phone and a laptop hitting the same URL see the same
  memory, because the memory isn't on any device.
- **Durable** — memory outlives the process. Restart the bot; it remembers.
- **Isolated** — each user id maps to its own namespace. We verified isolation
  live: user `siti` asked the bot what it knew about `rio-test` and it had nothing.

## Architecture

```
Browser ──(user id + text)──▶ Molong (Express, single file)
                                  │
       ┌──────────────────────────┴─────────────────────────────┐
       │ 1. recall(query, namespace=user)  ◀── Walrus Memory     │  semantic top-K
       │ 2. LLM reply, memories in system prompt                  │  ling-3.0-flash
       │ 3. LLM distills a "memory note" → remember(note, ns)     │  SEAL → mainnet blob
       │    (runs in the background so the reply is never blocked) │
       └──────────────────────────────────────────────────────────┘
```

The interesting bit is step 3. Storing the raw conversation is noisy — most turns
contain nothing worth remembering ("haha, funny"). So a cheap LLM pass distills each
turn into a short, self-contained English note (or `NONE`), and only notes get stored.
The extraction prompt + a `---` separator guard keep the notes clean even when the
model wants to be chatty.

## What we found (integration notes & bugs)

1. **The delegate key is the private key.** `MemWal.create({ key })` expects the
   *secret* half of the Ed25519 delegate pair, not the public one. The playground
   shows both; only the secret signs.
2. **`remember` is a job, not a write.** It returns `job_id`; durability is confirmed
   via `waitForRememberJob`. A chat reply must **not** be gated on the job — we run it
   fire-and-forget in the background and log the result.
3. **There is no "list all memories" API.** `restore(ns)` is a re-sync (returns
   `restored/skipped/failed` counts, not content). To *show* a user what the bot
   remembers we issue a broad semantic recall with a high `maxDistance`. Worth a
   dedicated API in the SDK.
4. **Latency is real.** Recall can take a few seconds and occasionally more on the
   public relayer. Every network-bound step in the request path is wrapped in a
   `Promise.race` cap so the UI degrades instead of hanging (and so a Cloudflare
   quick tunnel's 100s origin timeout is never tripped).
5. **Model choice matters more than expected.** Our first brain (`qwen3.8-27b` via the
   gateway) was flaky and slow for this workload (40s+ turns). `ling-3.0-flash`
   (~3s) turned out to be *better* at the memory-note extraction task — cleaner
   notes, correct `NONE` on chit-chat.
6. **LLM note drift.** The extractor occasionally appends "---" and restates the
   reply inside the note. Trivially fixed with a separator guard — included upstream
   if you like this pattern.

## Results (live, mainnet, 2026-09-20)

| Check | Result |
|---|---|
| Store fact → SEAL blob on mainnet | ✅ job confirmed |
| Recall across a fresh "session" | ✅ answered name/profession/preference from memory (`memoriesRecalled=2`) |
| Cross-tenant isolation | ✅ 0 leak between user namespaces |
| Show-memory endpoint | ✅ lists the user's stored facts |
| Demo uptime | running via Cloudflare tunnel, public URL in the repo |

## Reproduce

```bash
git clone <repo> && cd molong
npm install
cp .env.example .env        # LLM_API_KEY
# creds_mainnet.json from the Walrus Memory Playground (memory.walrus.xyz)
PORT=8090 node membot.mjs   # or USE_MOCK=1 for a chain-free demo
```

## Where it goes next

- Per-user delegate keys on-chain (today: one operator key, many namespaces — fine for
  a demo, not the trust boundary we'd ship).
- SSE token streaming for the reply; extraction can stay in the background.
- Forgetting: decay + prune via `restore` for long-lived users.
- Idempotency on `remember` to dedupe repeated facts.

Built for Walrus Sessions 8. It doesn't forget. 🦭
