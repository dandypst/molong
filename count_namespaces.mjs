// Count mainnet Walrus Memory blobs by namespace for event evidence.
import { MemWal } from '@mysten-incubation/memwal';
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync(new URL('./creds_mainnet.json', import.meta.url), 'utf8'));
const memwal = MemWal.create({
  key: c.delegatePrivateKey,
  accountId: c.accountId,
  serverUrl: 'https://relayer.memory.walrus.xyz',
});

let total = 0;
let applicationTotal = 0;
let cursor;
let page;
async function retryAuthUpstream(operation) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryAfter = Number(error.retryAfterSeconds) || 5;
      console.log(`listNamespaces attempt ${attempt} failed (${error.serverCode || error.status || 'error'}); retrying in ${retryAfter + 1}s`);
      await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));
    }
  }
  throw lastError;
}
do {
  page = await retryAuthUpstream(() => memwal.listNamespaces({ cursor, limit: 500 }));
  for (const ns of page.namespaces) {
    total += ns.memory_count;
    const isApplication = !ns.name.startsWith('verify-');
    if (isApplication) applicationTotal += ns.memory_count;
    console.log(`${ns.name}\t${ns.memory_count}\t${ns.storage_used}\t${isApplication ? 'application' : 'verification'}`);
  }
  cursor = page.next_cursor ?? undefined;
} while (page.has_more);

console.log(`TOTAL_ACCOUNT_BLOBS=${total}`);
console.log(`TOTAL_APPLICATION_BLOBS=${applicationTotal}`);
if (applicationTotal < 10) process.exit(1);
