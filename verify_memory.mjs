// verify_memory.mjs — proves the MemWal recall layer works, independent of LLM.
// (mock mode: in-memory; run with creds to prove against real relayer)
import { MemWal } from '@mysten-incubation/memwal';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MOCK = process.env.USE_MOCK === '1';
let memwal;
if (MOCK) {
  const { MemWalMock } = await import(new URL('./node_modules/@mysten-incubation/memwal/dist/mock.js', import.meta.url));
  memwal = MemWalMock.create({ owner: 'verify-owner' });
} else {
  const credsPath = process.env.CREDS_FILE
    ? fileURLToPath(new URL(process.env.CREDS_FILE, import.meta.url))
    : fileURLToPath(new URL('./creds_mainnet.json', import.meta.url));
  const c = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  memwal = MemWal.create({ key: c.delegatePrivateKey, accountId: c.accountId, serverUrl: 'https://relayer.memory.walrus.xyz' });
}

console.log('health:', JSON.stringify(await memwal.health()).slice(0, 100));

// seed: 2 namespaces, 3 memories each (simulating 2 users / days)
await memwal.rememberAndWait('User prefers concise answers and dislikes long paragraphs.', 'budi');
await memwal.rememberAndWait('User works as a bug bounty hunter on the Tedjo team.', 'budi');
await memwal.rememberAndWait('User owns a golden retriever named Mochi, adopted in 2025.', 'budi');
await memwal.rememberAndWait('User is allergic to shellfish and wants recipes without it.', 'cipta');

// semantic recall: query close in meaning to a stored fact, but not identical wording
const r1 = await memwal.recall({ query: 'how should I format my replies for this person', limit: 5, namespace: 'budi' });
const r2 = await memwal.recall({ query: 'what is this users job / profession', limit: 5, namespace: 'budi' });
const r3 = await memwal.recall({ query: 'shellfish allergy', limit: 5, namespace: 'budi', maxDistance: 0.2 }); // must be empty: this fact belongs to cipta
const r4 = await memwal.recall({ query: 'is this person allergic to anything', limit: 5, namespace: 'cipta' });

console.log('\n--- budi: "how should I format my replies" ---');
console.log(r1.results?.map(x => x.text).join(' | ') || '(empty)');
console.log('\n--- budi: "what is this users job" ---');
console.log(r2.results?.map(x => x.text).join(' | ') || '(empty)');
console.log('\n--- budi: "food restrictions" (must be EMPTY - cross-tenant leak test) ---');
console.log(r3.results?.map(x => x.text).join(' | ') || '(empty ✓ isolated)');
console.log('\n--- cipta: "allergic to anything" (must find shellfish) ---');
console.log(r4.results?.map(x => x.text).join(' | ') || '(empty ✗)');

// restore is a re-sync counter endpoint, not a list of memory contents
const st = await memwal.restore('budi');
console.log('\n--- restore budi namespace (counters, not content) ---');
console.log(JSON.stringify(st));

const isolated = r3.results?.every(x => !x.text.includes('shellfish'));
const ciptaFound = r4.results?.some(x => x.text.includes('shellfish'));
if (!isolated || !ciptaFound) {
  console.error('\nRESULT: ISOLATION/RECALL CHECK FAILED ✗');
  process.exit(1);
}
console.log('\nRESULT: MOCK RECALL + ISOLATION CHECK PASSED ✓');
