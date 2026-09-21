// verify_mainnet.mjs — live check against Walrus mainnet relayer with real creds
import { MemWal } from '@mysten-incubation/memwal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync(new URL('./creds_mainnet.json', import.meta.url), 'utf8'));
console.log('accountId:', c.accountId);

// 1) key integrity: derive public from the secret we'll use; must equal provided public
let ok = true;
let keyOk = false;
try {
  if (!c.delegatePrivateKey || !c.delegatePublicKey) {
    throw new Error('delegatePrivateKey and delegatePublicKey are required');
  }
  const kp = Ed25519Keypair.fromSecretKey(Buffer.from(c.delegatePrivateKey, 'hex'));
  const derivedPub = kp.getPublicKey().data;
  const givenPub = Buffer.from(c.delegatePublicKey, 'hex');
  keyOk = Buffer.compare(derivedPub, givenPub) === 0;
  console.log('key integrity: derived-public matches provided-public =', keyOk, keyOk ? '✓' : '✗ MISMATCH');
  if (!keyOk) {
    console.log('  derived:', Buffer.from(derivedPub).toString('hex'));
    console.log('  given  :', c.delegatePublicKey);
  }
} catch (e) {
  console.log('key integrity FAILED:', e.message);
}
if (!keyOk) ok = false;

// 2) runtime client against mainnet relayer
const memwal = MemWal.create({
  key: c.delegatePrivateKey,
  accountId: c.accountId,
  serverUrl: 'https://relayer.memory.walrus.xyz',
  namespace: 'verify',
});

async function retryAuthUpstream(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryAfter = Number(error.retryAfterSeconds) || 5;
      console.log(`${label} attempt ${attempt} failed (${error.serverCode || error.status || 'error'}); retrying in ${retryAfter + 1}s`);
      await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));
    }
  }
  throw lastError;
}

let health;
try {
  health = await memwal.health();
  console.log('health:', health.status, '| write_ready:', health.write_ready, '| writes:', health.writes);
  if (health.status !== 'ok' || health.write_ready !== true) {
    console.log('health FAILED: expected status=ok and write_ready=true');
    ok = false;
  }
} catch (e) { console.log('health FAILED:', e.message); ok = false; }

const NS = 'verify-' + Date.now().toString(36);
let blobId;
try {
  const r = await retryAuthUpstream('rememberAndWait', () =>
    memwal.rememberAndWait('Mainnet live-check: this fact is stored on Walrus mainnet at ' + new Date().toISOString(), NS, { timeoutMs: 120000 })
  );
  blobId = r.blobId || r.blob_id;
  console.log('rememberAndWait: confirmed | blob:', String(blobId || '').slice(0, 24));
  if (!blobId) { console.log('remember FAILED: no blob id'); ok = false; }
} catch (e) { console.log('remember FAILED:', e.message); ok = false; }

try {
  const rc = await retryAuthUpstream('recall', () =>
    memwal.recall({ query: 'live check stored fact mainnet', limit: 3, namespace: NS, maxDistance: 0.9 })
  );
  const hit = rc.results?.some(x => x.text.includes('Mainnet live-check'));
  console.log('recall hits:', rc.results?.length, '| expected fact found:', Boolean(hit));
  if (!hit) { console.log('recall FAILED: stored fact not found'); ok = false; }
} catch (e) { console.log('recall FAILED:', e.message); ok = false; }

console.log(ok ? '\nRESULT: MAINNET MEMORY LAYER WORKING ✓' : '\nRESULT: FAILED ✗');
process.exit(ok ? 0 : 1);
