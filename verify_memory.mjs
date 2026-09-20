// verify_memory.mjs — proves the MemWal recall layer works, independent of LLM.
// (mock mode: in-memory; run with creds to prove against real relayer)
import { MemWal } from '@mysten-incubation/memwal';

const MOCK = process.env.USE_MOCK === '1';
let memwal;
if (MOCK) {
  const { MemWalMock } = await import(new URL('./node_modules/@mysten-incubation/memwal/dist/mock.js', import.meta.url));
  memwal = MemWalMock.create({ owner: 'verify-owner' });
} else {
  const fs = await import('node:fs');
  const c = JSON.parse(fs.readFileSync(process.env.CREDS_FILE, 'utf8'));
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
const r3 = await memwal.recall({ query: 'any food restrictions to be aware of', limit: 5, namespace: 'budi' }); // should be empty (shellfish is cipta's)
const r4 = await memwal.recall({ query: 'is this person allergic to anything', limit: 5, namespace: 'cipta' });

console.log('\n--- budi: "how should I format my replies" ---');
console.log(r1.results?.map(x => x.text).join(' | ') || '(empty)');
console.log('\n--- budi: "what is this users job" ---');
console.log(r2.results?.map(x => x.text).join(' | ') || '(empty)');
console.log('\n--- budi: "food restrictions" (must be EMPTY - cross-tenant leak test) ---');
console.log(r3.results?.map(x => x.text).join(' | ') || '(empty ✓ isolated)');
console.log('\n--- cipta: "allergic to anything" (must find shellfish) ---');
console.log(r4.results?.map(x => x.text).join(' | ') || '(empty ✗)');

// restore: full namespace dump (for export / migration)
const st = await memwal.restore('budi');
console.log('\n--- restore budi namespace ---');
console.log((st.items || st.memories || []).map(x => x.text || x).join('\n') || JSON.stringify(st).slice(0, 200));
