# Molong — Walrus Sessions 8 submission manifest

Status: **GitHub repo populated; form not submitted**
Prepared: 2026-09-21
Decision required: Tedjo approved form submission on 2026-09-21; public article/X actions and missing submission inputs remain separate blockers.

## Official event facts

- Event: Walrus Sessions 8 — Chatbots That Remember
- Rules: https://thewalrussessions.wal.app/chatbots/index.html
- Submission form: https://airtable.com/appoDAKpC74UOqoDa/shro5iVzzjoWfZlPK
- Window: 2026-09-18 09:00 UTC through 2026-10-09 14:00 UTC
- Results announced: 2026-10-16
- Required model/runtime disclosure: state the model and runtime, and document integration friction; primary LLM must not be OpenAI or Anthropic for “Beyond the Big Two”

## Project

- Name: Molong
- Description: multi-tenant chatbot with cross-session/cross-device long-term memory
- Live demo: https://banana-another-varying-indicates.trycloudflare.com
- Support demo: https://banana-another-varying-indicates.trycloudflare.com/support.html
- Runtime: Node 26.7.0, Express 5.2.1, MemWal 0.1.7
- LLM: `ling-3.0-flash-fin` (InclusionAI lineage) via Jerouter OpenAI-compatible runtime; the gateway does not expose its upstream routing
- Memory: Walrus Memory mainnet, per-user namespaces, SEAL-encrypted blobs; local queue is transient retry state only
- Public GitHub repo: https://github.com/dandypst/molong

## Mainnet evidence

- Agent ID (public Ed25519 delegate public key): `c293f9ec45cf68b3ee84a961b2a223f72aa3f2d9b0949013beb4d6a9c3456cec`
- Account ID: `0x964db47dd3a74159b9f02abd12e859bacd2b563f9d5c1d765ef727c1085e2f19`
- Account blob count at last count: 16
- Application blob count after excluding `verify-*`: 11
- Required threshold: at least 10 blobs at submission
- Verification: `node count_namespaces.mjs`
- Mainnet write/recall verifier: `node verify_mainnet.mjs`
- Deployment evidence: `DEPLOYMENT.md`

The verifier recently passed: key integrity matched, health was `ok`, `write_ready=true`, the write job was confirmed, and recall returned the stored fact.

## Verified behavior

- `npm test`: 6/6 tests passed
- `npm run check`: passed
- `git diff --check`: passed
- Mock recall and cross-tenant isolation: passed
- Public `/api/health`: `ok`, `write_ready=true`, model `ling-3.0-flash-fin`
- Public cross-session recall: stored fact returned in a later independent request
- Public isolation check: another namespace returned `memoriesRecalled=0`
- Public `/api/memory`: returned the stored fact for the original user
- Important limitation: the client-supplied user id is not authenticated; namespaces provide separation, not authorization.
- Support page: served successfully at `/support.html`

## Remaining submission blockers

- [x] Model/runtime disclosed; the gateway does not expose its upstream provider, so the submission will state that limitation instead of inventing one.
- [ ] Register on DeepSurge and complete the application fields (project name, description, primary contact, GitHub account).
- [ ] Confirm the public GitHub repository at https://github.com/dandypst/molong contains source code and setup instructions, then add its URL to the form.
- [ ] Add a dedicated Sessions wallet address created specifically for this event.
- [ ] Publish the article on Medium or Inkray; include what the chatbot does, the Walrus Memory integration, before/after behavior, and real-use evidence. `ARTICLE.md` is only the draft.
- [ ] Showcase at least 3 different users and at least 10 memories per user, as requested on the DeepSurge event page.
- [ ] Complete the Walrus Memory feedback form with at least one bug/friction point and one improvement idea.
- [ ] Open any related MemWal GitHub issue(s), if applicable.
- [ ] Join the Walrus Discord.
- [ ] Share the published article on X tagging `@WalrusProtocol` under the official session announcement using #WalrusMemory.
- [ ] Re-run `node count_namespaces.mjs` immediately before submission; blob count must still be >= 10.
- [ ] Re-verify the public demo URL immediately before submission; quick-tunnel URLs change after restart.
- [x] Obtain explicit Tedjo approval for the final form submission (2026-09-21). Public article/X/GitHub actions remain separate public actions.

## Feedback to Walrus/MemWal

Friction observed:

1. The public relayer intermittently returns `AUTH_UPSTREAM_UNAVAILABLE`; request-path calls need bounded retries.
2. `remember` is an asynchronous job, not an immediate write; callers must retain `job_id` and poll to confirm a blob.
3. The SDK has no simple content-list API; showing stored facts requires broad semantic recall.
4. The dashboard terminology around delegate public key / agent ID was unclear during setup.

Improvement ideas:

1. Expose a first-class idempotent retry API that resumes an existing job after timeout.
2. Add a read-only content listing endpoint or a documented broad-recall helper for “show my memories”.
3. Label the delegate public key as `MEMWAL_AGENT_ID` in the dashboard.
4. Document `AUTH_UPSTREAM_UNAVAILABLE` retry behavior and `Retry-After` handling.

## Sources

[1] https://thewalrussessions.wal.app/chatbots/index.html — Walrus Sessions 8 — Chatbots That Remember rules
