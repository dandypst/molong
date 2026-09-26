# Molong: a chatbot that remembers across sessions with Walrus Memory

*Walrus Sessions 8 | #WalrusMemory*

Most chatbots start every conversation from zero. A user has to repeat a preference, a project detail, or a support problem each time. I built **Molong** to test a different approach: a multi-tenant chatbot that keeps useful context across conversations and devices using **Walrus Memory** on Sui mainnet. The event rules ask for a mainnet chatbot that uses Walrus Memory to persist and recall context across conversations, users, and sessions.[1]

Molong is for support teams, onboarding flows, community assistants, and personal helpers. It accepts a message and a user identifier. First, it recalls relevant long-term memories from that user's Walrus Memory namespace. Second, it gives those memories to the language model as historical context and generates a reply. Third, it extracts a short, self-contained fact from the turn. If the turn contains something worth keeping, the fact is written to Walrus in the background.

The result is a chatbot that can answer a later question using something learned earlier, without stuffing an entire conversation into every prompt.

The live demo is available at https://banana-another-varying-indicates.trycloudflare.com and https://banana-another-varying-indicates.trycloudflare.com/support.html. The source and setup instructions are public at https://github.com/dandypst/molong.

## Why Walrus Memory

Walrus Memory is designed for agents that need context to survive a process restart, a new device, or a different application. The relayer creates embeddings, encrypts the memory, stores it on Walrus, and indexes it for semantic retrieval. The documentation describes remember and recall as the basic operations, with recall searching by meaning rather than exact keywords.[2][5]

For a multi-user server, the useful pattern is one operator account plus one namespace per user. Walrus Memory's multi-tenant cookbook describes this as a logical bucket for each user under a shared account.[3] Molong follows that pattern: the application owns one MemWal account and selects a namespace for each user request.

This matters because the memory is portable and durable, but the application still has to decide how users are identified. A namespace is a storage boundary, not a login system.

## Before and after

Before the integration, Molong had no durable user context. A new request could not recover a preference stated in an earlier conversation.

After the integration, I ran a controlled mainnet check. A fact was submitted through the live chatbot, the `remember` job was confirmed, and a later independent request recalled the fact and used it in the answer (`memoriesRecalled=1`). A request using a different namespace returned no memories for the first user's fact. The public health endpoint returned HTTP 200 with `ok: true` and `write_ready: true`. On 21 September, the last verified count was 16 account blobs and 11 application blobs after excluding verification blobs.

Tedjo confirmed that the platform-specific threshold is met: three real users, each with at least ten stored memories. The corresponding logs and screenshots will be attached to the submission. Synthetic smoke tests are reported separately and are not relabeled as human usage.

## How the pieces fit together

```text
Browser
  |
  | text + user identifier
  v
Molong Express server
  |
  |-- recall(query, namespace)
  |       |
  |       v
  |   Walrus Memory semantic index
  |
  |-- LLM reply with recalled memories as untrusted context
  |
  |-- background memory-note extraction
          |
          v
      remember(note, namespace)
          |
          v
      encrypted Walrus mainnet blob
```

The server keeps a small local retry queue while an asynchronous write is waiting for confirmation. That file is operational state only. It is not used for recall and is not the user's durable memory store.

The MemWal quick start is useful here because `remember()` returns a job ID immediately; callers should retain that ID and confirm the job before treating the write as durable.[4] Molong keeps the user-facing reply fast and confirms the write in the background.

## What was harder than expected

The Walrus Memory dashboard shows several identifiers. The SDK needs the delegate secret key, not the owner wallet key and not the public agent ID. The multi-tenant cookbook explicitly recommends a delegate key for server access and keeping it out of the browser.[3]

It is easy to assume that a successful `remember()` call means the blob is already searchable. It does not. The call accepts a job, and the job can finish later. Molong stores the job ID, retries bounded failures, and does not block the chat reply while waiting.

`restore()` rebuilds an index and returns counts, not the stored texts. To show what the bot remembers, Molong uses a broad semantic `recall()` query. That is the right interface for meaning-based retrieval, but it is less convenient than a normal database listing.

Recall and remember can take several seconds, and the public relayer can be slower under load. Molong caps request-path calls and lets the write confirmation run in the background. This keeps the UI responsive, but it also means the interface has to make eventual consistency clear.

The first model used for memory-note extraction was slower and produced noisier notes. The current build declares `ling-3.0-flash-fin`, served through the Jerouter OpenAI-compatible runtime. The gateway does not expose its upstream routing, so the project reports the model and runtime without inventing a provider.

The extraction model sometimes added a separator and repeated the reply after the useful fact. Molong strips labels, cuts at the separator, limits the note length, and skips empty or `NONE` results.

## Security boundary and limitation

Recalled memories are user-controlled text. Molong labels them as historical context and tells the model not to follow instructions embedded in them, but that is a mitigation, not a security boundary.

The current demo accepts a user identifier from the client. That makes it convenient to try, but it also means anyone who knows an identifier can request that namespace. The namespace separates data; it does not authenticate the caller. A production deployment should derive the identifier from a real sign-in or wallet proof and should use a collision-resistant, stable namespace mapping.

This limitation is documented in the repository rather than hidden behind the word "multi-tenant."

## What I would build next

The next version should replace client-supplied identifiers with authenticated user identities, use a collision-resistant namespace derivation, and make restart recovery atomic. I would also add a read-only memory preview flow and make the distinction between "accepted for storage" and "confirmed on Walrus" visible in the UI.

Molong is a small experiment, but it shows the useful part clearly: a chatbot can keep context outside its prompt, store that context on mainnet, and retrieve it by meaning in a later conversation.

## Sources

[1] Walrus Sessions 8 rules: https://thewalrussessions.wal.app/chatbots/index.html

[2] What is Walrus Memory?: https://docs.wal.app/walrus-memory/getting-started/what-is-walrus-memory

[3] Multi-tenant server cookbook: https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant

[4] MemWal quick start: https://github.com/MystenLabs/MemWal/blob/dev/docs/getting-started/quick-start.md

[5] Walrus Memory product page: https://walrus.xyz/products/walrus-memory
