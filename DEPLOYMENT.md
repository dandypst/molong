# Molong deployment evidence

Verified: 2026-09-21 06:00 WIB

## Runtime

- Public demo: https://banana-another-varying-indicates.trycloudflare.com
- Support demo: https://banana-another-varying-indicates.trycloudflare.com/support.html
- Node process: PID 605059, bound to `0.0.0.0:8090`
- Tunnel: existing Cloudflare quick tunnel to `http://127.0.0.1:8090`
- Health response: `{"ok":true,"relayer":"ok","write_ready":true,"model":"ling-3.0-flash-fin"}`
- Root page: HTTP 200
- Support page: HTTP 200

## Functional evidence

- A synthetic preference was stored through `POST /api/chat`.
- A later independent request recalled it with `memoriesRecalled=1`.
- `/api/memory` returned the stored fact for the original namespace.
- A different namespace returned `memoriesRecalled=0`.
- The support endpoint accepted `role:"support"` and used the separate support namespace.

## Mainnet evidence

- `node verify_mainnet.mjs`: key integrity passed; health `ok`; `write_ready=true`; write job confirmed; recall found the stored fact.
- `node count_namespaces.mjs`: 16 account blobs total; 11 application blobs after excluding `verify-*` namespaces.

## Automated gates

- `npm test`: 6/6 passed.
- `npm run check`: all JavaScript syntax checks passed.
- `git diff --check`: passed.
- Added-line secret scan: no matches.
- Public HTML unsafe HTML sink scan (`innerHTML`, `insertAdjacentHTML`, `eval`, `Function`): no matches.
- Source includes an API rate limit of 30 requests/minute per source IP; restart the public process before claiming it is active.

## Limits

- The Cloudflare quick-tunnel URL is ephemeral and changes after tunnel restart.
- The client-supplied user id is not authenticated; namespaces separate data but are not an authorization boundary.
- The local retry queue is transient operational state, never used for recall or exposed as a memory database.
- This deployment is ready for review, not submitted. Tedjo approved the form submission on 2026-09-21. The public source repo is https://github.com/dandypst/molong; article publication, DeepSurge registration, dedicated Sessions wallet, real-user evidence, feedback/Discord/X actions, and remaining form inputs are still pending.
