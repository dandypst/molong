// lib/http.mjs — shared Vercel Function plumbing.
//
// Vercel Node Functions wrap this ESM file in a CommonJS harness with
// top-level await, so the lazily-initialized client + health gate below
// survive across invocations within one function instance (Eisberg style).
//
// IMPORTANT: deliberately NO writes to the filesystem here — the Vercel
// runtime is read-only outside /tmp, and /tmp state is per-instance and
// not durable. Memory persistence lives on Walrus Memory, not on disk.

import { createMemWalClient, requireHealthy } from './relayer.mjs';

let clientPromise;

export function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { memwal, useMock } = await createMemWalClient({});
      const h = await requireHealthy(memwal, { useMock });
      return { memwal, useMock, health: h };
    })();
    clientPromise.catch(() => {
      // allow the next invocation to retry (e.g. relayer auth recovers)
      clientPromise = null;
    });
  }
  return clientPromise;
}

export function cors(req, res) {
  // Same-origin in practice (page + API on the same vercel.app host);
  // header set unconditionally so preflight never fails.
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).json({});
  }
}

export function ipOf(req) {
  // Vercel terminates TLS; x-forwarded-for carries the client IP.
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.ip || 'unknown';
}

export function json(res, status, obj) {
  res.status(status).json(obj);
}
