// lib/relayer.mjs — Walrus Memory (MemWal) client factory shared by the local
// Express server (membot.mjs) and the Vercel serverless functions (api/*.mjs).
//
// Credential sources (first wins):
//   1. Env vars:  WALRUS_ACCOUNT_ID + WALRUS_DELEGATE_KEY   (Vercel)
//   2. Env var:   CREDS_FILE=/abs/path/to/creds.json
//   3. ./creds_mainnet.json, then ./creds_testnet.json      (local dev)
// Use USE_MOCK=1 to get an in-memory mock client (no chain).

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MemWal } from '@mysten-incubation/memwal';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export function loadCreds() {
  const env = process.env;
  if (env.WALRUS_ACCOUNT_ID && env.WALRUS_DELEGATE_KEY) {
    return {
      accountId: env.WALRUS_ACCOUNT_ID,
      delegatePrivateKey: env.WALRUS_DELEGATE_KEY,
      network: 'env',
      note: 'from env vars',
    };
  }
  const candidates = [
    env.CREDS_FILE,
    here('../creds_mainnet.json'),
    here('../creds_testnet.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (c.accountId && c.delegatePrivateKey) {
        return { ...c, source: p };
      }
    } catch {}
  }
  return null;
}

// Returns { memwal, useMock } or throws with an actionable message.
export async function createMemWalClient({ serverUrl, useMock } = {}) {
  const RELAYER = serverUrl || process.env.RELAYER_URL || 'https://relayer.memory.walrus.xyz';
  if (useMock === true || process.env.USE_MOCK === '1') {
    // v0.1.7 does not export a "./mock" subpath and the SDK is ESM-only, so the
    // built dist file is loaded dynamically. (Mock is a local-dev feature; the
    // Vercel build never sets USE_MOCK.)
    const { MemWalMock } = await import(
      '../node_modules/@mysten-incubation/memwal/dist/mock.js'
    );
    const memwal = MemWalMock.create({ owner: 'mock-operator', namespace: 'default' });
    console.log('[relayer] using MemWalMock (no chain, in-memory)');
    return { memwal, useMock: true };
  }
  const creds = loadCreds();
  if (!creds) {
    throw new Error(
      'No Walrus creds. Set WALRUS_ACCOUNT_ID + WALRUS_DELEGATE_KEY (env) ' +
      'or CREDS_FILE, or place creds_mainnet.json next to lib/.',
    );
  }
  const memwal = MemWal.create({
    key: creds.delegatePrivateKey,
    accountId: creds.accountId,
    serverUrl: RELAYER,
    namespace: 'default',
  });
  console.log(`[relayer] client from ${creds.note || creds.source || 'creds'} (relayer=${RELAYER})`);
  return { memwal, useMock: false };
}

// fail-fast health gate: status ok AND write_ready (unless mock)
export async function requireHealthy(memwal, { useMock, timeoutMs = 10_000 } = {}) {
  const h = await Promise.race([
    memwal.health(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('health timeout')), timeoutMs)),
  ]);
  const healthy = h.status === 'ok' && (useMock || h.write_ready === true);
  if (!healthy) throw new Error(`relayer unhealthy: status=${h.status} write_ready=${h.write_ready}`);
  return h;
}
