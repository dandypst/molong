// lib/llm.mjs — OpenAI-compatible chat completions client with per-attempt
// timeout + bounded retries. Shared by the local Express server (cap 25s,
// 2 attempts) and the Vercel functions (tighter caps to stay inside the
// function maxDuration budget).
//
// Env: on Vercel the variables come from the project's Environment
// Variables; locally the .env file next to the project root is read as a
// fallback (only when the variable is not already set — real env always wins).

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadDotEnv() {
  try {
    const envText = fs.readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8');
    for (const line of envText.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

export function createLlmClient({
  baseUrl,
  key,
  model,
  capMs = 25_000,
  retries = 2,
  backoffMs = 1_000,
  temperature = 0.4,
  maxTokens = 400,
} = {}) {
  loadDotEnv(); // local fallback only; real env vars always win
  const BASE = baseUrl || process.env.LLM_BASE_URL || 'https://je.jerouter.web.id/v1';
  const LLM_KEY = key || process.env.LLM_API_KEY || '';
  const LLM_MODEL = model || process.env.LLM_MODEL || 'ling-3.0-flash-fin';

  return async function llm(messages) {
    if (!LLM_KEY) throw new Error('LLM_API_KEY not set');
    let lastErr;
    for (let i = 0; i < retries; i += 1) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), capMs);
        const r = await fetch(`${BASE}/chat/completions`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
          body: JSON.stringify({ model: LLM_MODEL, messages, temperature, max_tokens: maxTokens }),
        });
        clearTimeout(to);
        if (!r.ok) {
          const t = await r.text();
          // 4xx (except 429) = not retryable
          if (r.status >= 400 && r.status < 500 && r.status !== 429) {
            throw new Error(`LLM ${r.status}: ${t.slice(0, 200)}`);
          }
          lastErr = new Error(`LLM ${r.status}: ${t.slice(0, 200)}`);
          await new Promise(rs => setTimeout(rs, backoffMs * (i + 1)));
          continue;
        }
        const j = await r.json();
        return j.choices?.[0]?.message?.content ?? '';
      } catch (e) {
        lastErr = e;
        if (i < retries - 1) await new Promise(rs => setTimeout(rs, backoffMs * (i + 1)));
      }
    }
    throw lastErr;
  };
}
