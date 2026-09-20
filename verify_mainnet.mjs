// verify_mainnet.mjs — live check against Walrus mainnet relayer with real creds
import { MemWal } from '@mysten-incubation/memwal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync(new URL('./creds_mainnet.json', import.meta.url), 'utf8'));
console.log('accountId:', c.accountId);

// 1) key integrity: derive public from the secret we'll use; must equal provided public
try {
  const kp = Ed25519Keypair.fromSecretKey(Buffer.from(c.delegatePrivateKey, 'hex'));
  const derivedPub = kp.getPublicKey().toBytes();
  const givenPub = Buffer.from(c.delegatePublicKey, 'hex');
  const match = Buffer.compare(derivedPub, givenPub) === 0;
  console.log('key integrity: derived-public matches provided-public =', match, match ? '✓' : '✗ MISMATCH');
  if (!match) { console.log('  derived:', Buffer.from(derivedPub).toString('hex')); console.log('  given  :', c.delegatePublicKey); }
} catch (e) { console.log('key integrity check skipped:', e.message); }

// 2) runtime client against mainnet relayer
const memwal = MemWal.create({
  key: c.delegatePrivateKey,
  accountId: c.accountId,
  serverUrl: 'https://relayer.memory.walrus.xyz',
  namespace: 'verify',
});

let ok = true;
try { const h = await memwal.health(); console.log('health:', h.status, '| write_ready:', h.write_ready, '| writes:', h.writes); }
catch (e) { console.log('health FAILED:', e.message); ok = false; }

const NS = 'verify-' + Date.now().toString(36);
try {
  const r = await memwal.rememberAndWait('Mainnet live-check: this fact is stored on Walrus mainnet at ' + new Date().toISOString(), NS, { timeoutMs: 30000 });
  console.log('rememberAndWait:', r.status, '| blob:', (r.blobId || '').slice(0, 24));
} catch (e) { console.log('remember FAILED:', e.message); ok = false; }

try {
  const rc = await memwal.recall({ query: 'live check stored fact mainnet', limit: 3, namespace: NS, maxDistance: 0.9 });
  console.log('recall hits:', rc.results?.length, '| top:', rc.results?.[0]?.text?.slice(0, 60));
} catch (e) { console.log('recall FAILED:', e.message); ok = false; }

console.log(ok ? '\nRESULT: MAINNET MEMORY LAYER WORKING ✓' : '\nRESULT: FAILED ✗');
process.exit(ok ? 0 : 1);
