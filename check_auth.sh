#!/usr/bin/env bash
# Retry auth check for Walrus Memory operator key (Molong demo).
# Run when 401 AUTH_REJECTED is suspected or to confirm recovery.
cd "$(dirname "$0")"
OUT=$(node verify_mainnet.mjs 2>&1)
if echo "$OUT" | grep -q "rememberAndWait OK"; then
  echo "AUTH OK — $(date -u '+%F %T UTC')"
  echo "$OUT" | grep -E "T0|T2|PASS|FAIL" | tail -4
else
  echo "AUTH STILL DOWN — $(date -u '+%F %T UTC') (last: $(echo "$OUT" | grep -m1 'AUTH_REJECTED' | head -c 80))"
fi
