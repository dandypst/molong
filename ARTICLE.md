# Molong 🦭 — Building a Chatbot That Remembers with Walrus Memory

*Walrus Sessions 8 · #WalrusMemory*

## The problem

Most chatbots amnesia: the moment a session ends, everything is gone. A support bot
forgets the customer's name, a tutor forgets where the student got stuck, a community
assistant forgets the conventions the community agreed on last week.

We built **Molong** — a small multi-tenant chatbot that remembers users **across
sessions, across devices, on Sui mainnet**, using **Walrus Memory (MemWal)** for
long-term memory and `ling-3.0-flash-fin` as the declared brain through an
OpenAI-compatible gateway. The model lineage is InclusionAI; Jerouter does not expose
its upstream provider, so the submission states the runtime honestly without inventing one.[1][2][3]

## Why Walrus Memory

The killer feature for us: memory is **stored as encrypted (SEAL) blobs on the Walrus
network** and retrieved with **semantic vector search** — not keyword grep, not a SQL
table, not context stuffing. The app has no persistent user-memory database. It keeps a local
`pending_notes.json` retry queue (file mode `0600`); durable user memory lives in Walrus Memory. The queue is an operational retry buffer only: it is never used for recall, is not a user-facing memory database, and is cleared after confirmation.

That means:

- **Cross-device** for free — a phone and a laptop hitting the same URL see the same
  memory, because the memory isn't on any device.
- **Durable** — memory outlives the process. Restart the bot; it remembers.
- **Namespace separation:** each user id maps to its own namespace. We verified that a
  second namespace recalled nothing when asked about the first user's facts. The
  client-supplied user id is not authentication.

## Architecture

```
Browser ──(user id + text)──▶ Molong (Express + memory-note helper)
                                  │
       ┌──────────────────────────┴─────────────────────────────┐
       │ 1. recall(query, namespace=user)  ◀── Walrus Memory     │  semantic top-K
       │ 2. LLM reply, memories treated as untrusted user context           │  ling-3.0-flash-fin
       │ 3. LLM distills a "memory note" → remember(note, ns)     │  SEAL → mainnet blob
       │    (write confirmation runs in the background)        │
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
   `Promise.race` cap so the UI degrades instead of hanging.
5. **Model choice matters more than expected.** Our first brain (`qwen3.8-27b` via the
   gateway) was flaky and slow for this workload (40s+ turns). `ling-3.0-flash-fin`
   (~3s) turned out to be *better* at the memory-note extraction task — cleaner
   notes, correct `NONE` on chit-chat.
6. **LLM note drift.** The extractor occasionally appends "---" and restates the
   reply inside the note. Trivially fixed with a separator guard — included upstream
   if you like this pattern.

## Event requirements (official rules)
The Walrus Sessions 8 rules require registration on DeepSurge, a mainnet chatbot, a deployed channel reachable by real users,
a public GitHub repository with setup instructions, at least 10 mainnet blobs written by the agent,
the LLM/runtime disclosure, a dedicated Sessions wallet, a published article, feedback/bug submission,
Discord participation, and sharing the article on X with `@WalrusProtocol` under the session announcement using `#WalrusMemory`.[1] DeepSurge additionally asks builders to showcase at least 3 different users storing at least 10 memories each. The event window is
18 September 2026 09:00 UTC through 9 October 2026 14:00 UTC.[1]

## Results (live, mainnet, 2026-09-21)

| Check | Result |
|---|---|
| Store fact → SEAL blob on mainnet | ✅ job confirmed |
| Recall across a fresh "session" | ✅ answered stored name/preference from memory (`memoriesRecalled=1`) |
| Cross-tenant isolation | ✅ 0 leak between user namespaces |
| Show-memory endpoint | ✅ lists the user's stored facts |
| Demo uptime | ✅ live via Cloudflare quick tunnel; URL recorded in README |
| Mainnet evidence | ✅ 16 account blobs; 11 application blobs after excluding `verify-*` |

## Before and after

Before Walrus Memory, Molong had no durable user context: a new request or browser
could not recover a preference stated in an earlier conversation. After integration,
the live mainnet flow stored a synthetic preference, then a later independent request
recalled it (`memoriesRecalled=1`). A second namespace returned no memories in the
same test. This proves the technical flow; broad real-user usage evidence is still
pending for the event submission.

## Reproduce

```bash
git clone https://github.com/dandypst/molong.git && cd molong
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
- Idempotency on `remember` dedupes repeated facts and supports restart recovery.

Built for Walrus Sessions 8. It doesn't forget. 🦭

## Sources

[1] https://thewalrussessions.wal.app/chatbots/index.html — Walrus Sessions 8 rules
    > "The overarching goal of the Hackathon is to foster developer engagement with the Walrus protocol resulting in the creation and deployment of chatbots that use Walrus Memory to persist and recall context across conversations, users, and sessions."
[2] https://huggingface.co/inclusionAI/Ling-3.0-flash-Fin — InclusionAI Ling 3.0 Flash Fin model card
    > "Ling-3.0-flash-Fin is the first finance-enhanced model in the Ant Ling family. Developed by Ant Group with leading financial institutions and domain experts, it extends Ling-3.0-flash through continued training on high-quality financial data."
[3] https://www.antgroup.com/en/news-media/press-releases/1788944400000 — Ant Group Ling 3.0 Flash Fin announcement
    > "Ant Group today announced the open-sourcing of Ling-3.0-flash-Fin at the 2026 Inclusion·Conference on the Bund."
