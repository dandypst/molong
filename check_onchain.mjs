import { SuiGrpcClient } from '@mysten/sui/grpc';
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('./creds_mainnet.json', 'utf8'));
const g = new SuiGrpcClient({
  baseUrl: 'https://grpc.mainnet.sui.io:443',
  network: 'mainnet',
});

const o = await g.getObject({ id: c.accountId, showContent: true, showType: true });
console.log('STATUS:', o.status, '| TYPE:', o.type || o.data?.type);
const fields =
  o.content?.data?.fields || o.data?.content?.data?.fields || o.data?.fields || {};
console.log('FIELD NAMES:', Object.keys(fields));
for (const [k, v] of Object.entries(fields)) {
  const s = JSON.stringify(v);
  console.log(k + ':', s.length > 500 ? s.slice(0, 500) + '…' : s);
}
