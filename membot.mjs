// membot.mjs — "Molong" 🦭 — multi-tenant chatbot with Walrus Memory
// 1 operator account, namespace per user. LLM: qwen3.8 via Jerouter (OpenAI-compatible,
// not OpenAI/Anthropic -> "Beyond the Big Two").
//
// Architecture:
//  - Walrus Memory (MemWal SDK) = long-term memory, encrypted at rest (SEAL),
//    stored on Walrus mainnet blobs, recalled via semantic vector search.
//  - LLM builds a "memory note" from each turn + recalls top-K memories per query.
//  - Cross-device: any browser hitting the same public URL sees the same memory.

import express from 'express';
import { MemWal } from '@mysten-incubation/memwal';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load .env (LLM_API_KEY etc.) if present — no dotenv dep.
try {
  const envText = fs.readFileSync(fileURLToPath(new URL('./.env', import.meta.url)), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
} catch {}

const RELAYER = process.env.RELAYER_URL || 'https://relayer.memory.walrus.xyz';
const LLM_BASE = process.env.LLM_BASE_URL || 'https://je.jerouter.web.id/v1';
const LLM_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'qwen3.8-27b';
const PORT = process.env.PORT || 8090;
const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url));

// Load operator creds (accountId + delegate key).
// CREDS_FILE explicit > creds_mainnet.json > creds_testnet.json (dev).
function loadCreds() {
  const candidates = [
    process.env.CREDS_FILE,
    fileURLToPath(new URL('./creds_mainnet.json', import.meta.url)),
    fileURLToPath(new URL('./creds_testnet.json', import.meta.url)),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (c.accountId && c.delegatePrivateKey) { console.log(`[membot] creds from ${p} (network=${c.network || 'unknown'})`); return c; }
    } catch {}
  }
  return null;
}
const creds = process.env.USE_MOCK === '1' ? null : loadCreds();

if (!process.env.USE_MOCK && !creds) {
  console.error('[membot] No creds file. Run setup (do_setup.mjs) or set CREDS_FILE.');
  process.exit(1);
}

// Operator client: real MemWal (mainnet/testnet) or in-memory mock for local dev.
// Mock exposes the same surface (remember/recall/waitForRememberJob/health).
let memwal;
const USE_MOCK = process.env.USE_MOCK === '1';
if (USE_MOCK) {
  // v0.1.7 does not export a "./mock" subpath; import the built dist file directly.
  const { MemWalMock } = await import(new URL('./node_modules/@mysten-incubation/memwal/dist/mock.js', import.meta.url));
  memwal = MemWalMock.create({ owner: 'mock-operator', namespace: 'default' });
  console.log('[membot] using MemWalMock (no chain, in-memory)');
} else {
  memwal = MemWal.create({
    key: creds.delegatePrivateKey,
    accountId: creds.accountId,
    serverUrl: RELAYER,
    namespace: 'default',
  });
}

// sanity: health probe
let health = null;
try { health = await memwal.health(); console.log('[membot] relayer health:', JSON.stringify(health).slice(0, 120)); }
catch (e) { console.error('[membot] relayer health FAILED:', e.message); }

// ---------- LLM helper (OpenAI-compatible chat completions, with retry) ----------
// Timing budget: quick-tunnel origin timeout = 100s. Recall + reply must fit
// well under that, so per-attempt cap 25s, at most 2 attempts (~55s worst case).
async function llm(messages, retries = 2) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25_000); // per-attempt cap
      const r = await fetch(`${LLM_BASE}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_KEY}` },
        body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0.4, max_tokens: 400 }),
      });
      clearTimeout(to);
      if (!r.ok) {
        const t = await r.text();
        // 4xx (except 429) = not retryable
        if (r.status >= 400 && r.status < 500 && r.status !== 429) {
          throw new Error(`LLM ${r.status}: ${t.slice(0, 200)}`);
        }
        lastErr = new Error(`LLM ${r.status}: ${t.slice(0, 200)}`);
        await new Promise(rs => setTimeout(rs, 1000 * (i + 1)));
        continue;
      }
      const j = await r.json();
      return j.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      lastErr = e;
      await new Promise(rs => setTimeout(rs, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

// ---------- memory note extraction ----------
// Each turn we ask the LLM to distill the user's utterance into a compact
// factual "memory note" (what the bot should remember). This is the
// cross-session memory: semantic recall later finds it by meaning, not keywords.
async function extractMemoryNote(userText, assistantText, ns) {
  const prompt = [
    { role: 'system', content: 'You extract durable user facts/preferences for long-term memory. Output ONLY a short, self-contained English note (max 25 words) capturing anything the user said worth remembering across sessions: identity, preferences, facts, goals, decisions. If nothing worth remembering, output exactly: NONE' },
    { role: 'user', content: `User: ${userText}\nAssistant: ${assistantText}` },
  ];
  const out = await llm(prompt);
  let clean = out.trim().replace(/^"|"$/g, '');
  // The model occasionally appends "---" + a restated reply; keep only the note.
  const sep = clean.search(/\n\s*-{3,}\s*\n/);
  if (sep !== -1) clean = clean.slice(0, sep).trim();
  // Drop any leading "User:" / "Note:" style labels.
  clean = clean.replace(/^(user|note|memory)\s*[:\-]\s*/i, '').trim();
  if (!clean || clean.toUpperCase() === 'NONE') return null;
  return clean.slice(0, 300);
}

// ---------- main handler ----------
const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function sanitizeNs(ns) {
  const s = String(ns || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);
  return s || 'default';
}

app.post('/api/chat', async (req, res) => {
  const { text, user } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const ns = sanitizeNs(user || 'guest');

  // 1) RECALL long-term memory for this user (semantic search on their namespace)
  let memories = [];
  try {
    const rc = await memwal.recall({ query: text, limit: 6, namespace: ns, maxDistance: 0.85 });
    memories = (rc.results || []).map(m => m.text);
  } catch (e) { console.error('[recall] err:', e.message); }

  // 2) system prompt carries recalled memories
  const sys = [
    `You are Molong, a warm, concise chatbot that remembers users across sessions and devices via Walrus Memory.`,
    `Current user: ${ns}`,
    `Current time: ${new Date().toISOString()}`,
    memories.length
      ? `Long-term memories about this user (from previous sessions/devices — use naturally, don't recite):\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : `No long-term memories yet for this user.`,
    `Be helpful. If the user shares something worth remembering, you'll store it automatically.`,
  ].join('\n');

  // 3) LLM reply
  let reply;
  try {
    reply = await llm([
      { role: 'system', content: sys },
      { role: 'user', content: text },
    ]);
  } catch (e) {
    return res.status(502).json({ error: 'LLM error: ' + e.message });
  }

  // 4) RE-MEMBER: distill this turn into a memory note and store it in the
  //    BACKGROUND (fire & forget) so the reply is not held up by the LLM
  //    extraction call + relayer job. Durable: queued on mainnet, no timeout
  //    in the request path. Errors are logged, never surfaced to the user.
  (async () => {
    try {
      const note = await extractMemoryNote(text, reply, ns);
      if (note) {
        const accepted = await memwal.remember(note, ns);
        memwal.waitForRememberJob(accepted.job_id, { timeoutMs: 60000 })
          .then(d => { if (d) console.log(`[memory] stored for ${ns}: ${note}`); else console.log(`[memory] job not confirmed for ${ns}`); })
          .catch(e => console.error(`[memory] bg store err (${ns}):`, e.message));
      }
    } catch (e) { console.error('[remember] err:', e.message); }
  })();

  res.json({
    reply: reply.trim(),
    user: ns,
    memoriesRecalled: memories.length,
    memoryQueued: true, // distill+store runs in background; /api/memory to verify
    ts: Date.now(),
  });
});

// Show what the bot remembers for this user.
// The SDK has no pure "list" method; recall is semantic search. A broad
// identity/preference query surfaces the stored facts. We also run restore()
// first to make sure the namespace's blobs are synced, then recall.
const MEMORY_QUERY = 'who is this user: their name, role, profession, goals, and preferences';
app.get('/api/memory', async (req, res) => {
  const ns = sanitizeNs(req.query.user || 'guest');
  try {
    // ensure the namespace blobs are available (best-effort, capped)
    await Promise.race([memwal.restore(ns, 20), new Promise(rs => setTimeout(rs, 10000))]).catch(() => {});
    const r = await Promise.race([
      memwal.recall({ query: MEMORY_QUERY, limit: 15, namespace: ns, maxDistance: 0.95 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('recall timeout')), 15000)),
    ]);
    res.json({ user: ns, count: r.results?.length || 0, memories: (r.results || []).map(m => m.text) });
  } catch (e) {
    res.status(502).json({ error: 'memory list failed: ' + e.message });
  }
});

app.get('/api/health', async (req, res) => {
  let h = null, rel = 'unknown';
  try { rel = (await memwal.health()).status; } catch (e) { rel = 'down: ' + e.message; }
  res.json({ ok: true, relayer: rel, model: LLM_MODEL, time: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[membot] Molong listening on :${PORT}  (relayer=${RELAYER}, model=${LLM_MODEL})`);
});
