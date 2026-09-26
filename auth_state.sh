#!/usr/bin/env bash
# Deterministic auth-state probe for the Walrus Memory operator key.
# Prints ONLY a stable state string (no timestamps) so the cron monitor
# can diff against the previous tick. Exits 0 always.
cd "$(dirname "$0")" || exit 1
OUT=$(timeout 120 node verify_mainnet.mjs 2>&1)
if echo "$OUT" | grep -q "rememberAndWait OK"; then
  echo "MOLONG_AUTH=OK"
else
  echo "MOLONG_AUTH=DOWN(AUTH_REJECTED)"
fi
