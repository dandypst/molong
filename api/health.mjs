// Vercel Function: GET /api/health
// Liveness + relayer status for the demo UI (badges in the header).

import { cors, getClient, json } from '../lib/http.mjs';

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return;
  res.set('Cache-Control', 'no-store');

  let client;
  try {
    client = await getClient();
  } catch (e) {
    // getClient only threw on (relayer down | creds missing | auth failed) —
    // the exact conditions the local /api/health reports as 503.
    return json(res, 503, {
      ok: false,
      relayer: 'down: ' + e.message,
      model: process.env.LLM_MODEL || 'ling-3.0-flash-fin',
      time: new Date().toISOString(),
    });
  }

  let h = null;
  try {
    h = await Promise.race([
      client.memwal.health(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health timeout')), 10_000)),
    ]);
  } catch (e) {
    return json(res, 503, {
      ok: false,
      relayer: 'down: ' + e.message,
      model: process.env.LLM_MODEL || 'ling-3.0-flash-fin',
      time: new Date().toISOString(),
    });
  }

  return json(res, 200, {
    ok: client.useMock ? h.status === 'ok' : h.status === 'ok' && h.write_ready === true,
    relayer: h.status,
    write_ready: h.write_ready ?? (client.useMock ? true : null),
    model: process.env.LLM_MODEL || 'ling-3.0-flash-fin',
    time: new Date().toISOString(),
  });
}
