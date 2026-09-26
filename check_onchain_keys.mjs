import { SuiGrpcClient } from '@mysten/sui/grpc';
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('./creds_mainnet.json', 'utf8'));
const g = new SuiGrpcClient({ baseUrl: 'https://grpc.mainnet.sui.io:443', network: 'mainnet' });

const o = await g.getObject({ id: c.accountId, showContent: true, showType: true });
console.log('STATUS:', o.status, '| TYPE:', o.type || o.data?.type);
const fields = o.content?.data?.fields || o.data?.content?.data?.fields || o.data?.fields || {};
console.log('FIELD NAMES:', Object.keys(fields));
const keys = fields.delegate_keys || fields.delegateKeys;
if (keys) {
  console.log('delegate_keys:', JSON.stringify(keys).slice(0, 1500));
}
for (const [k, v] of Object.entries(fields)) {
  if (k === 'delegate_keys' || k === 'delegateKeys') continue;
  const s = JSON.stringify(v);
  console.log(k + ':', s.length > 400 ? s.slice(0, 400) + '…' : s);
}
