// Vercel Function: GET /api/memory?user=<id>[&role=support]
// Surfaces what Molong currently remembers for a user (semantic recall,
// after a best-effort namespace restore).

import { cors, getClient, json } from '../lib/http.mjs';
import { namespaceFor, sanitizeNamespace } from '../memory_note.mjs';

const MEMORY_QUERY = 'who is this user: their name, role, profession, goals, and preferences';

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return;
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

  const rawNs = sanitizeNamespace(req.query.user || 'guest');
  const ns = namespaceFor(rawNs, req.query.role === 'support');

  let client;
  try {
    client = await getClient();
  } catch (e) {
    return json(res, 503, { error: 'relayer unavailable: ' + e.message });
  }
  const { memwal } = client;

  try {
    // ensure the namespace blobs are available (best-effort, capped)
    await Promise.race([memwal.restore(ns, 20), new Promise(rs => setTimeout(rs, 10_000))]).catch(() => {});
    const r = await Promise.race([
      memwal.recall({ query: MEMORY_QUERY, limit: 15, namespace: ns, maxDistance: 0.95 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('recall timeout')), 12_000)),
    ]);
    return json(res, 200, {
      user: ns,
      count: r.results?.length || 0,
      memories: (r.results || []).map(m => m.text),
    });
  } catch (e) {
    return json(res, 502, { error: 'memory list failed: ' + e.message });
  }
}
