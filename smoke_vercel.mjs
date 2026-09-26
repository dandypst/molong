// Smoke test for the Vercel api/*.mjs handlers with USE_MOCK=1.
// Simulates the Vercel Function invocation (default export, Node-style req/res).
import assert from 'node:assert/strict';

process.env.USE_MOCK = '1';

function mockRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    set(k, v) { headers[String(k).toLowerCase()] = v; return res; },
    status(c) { res.statusCode = c; return res; },
    json(obj) { res.jsonBody = obj; res.ended = true; return res; },
  };
  return res;
}

const chat = (await import('./api/chat.mjs')).default;
const memory = (await import('./api/memory.mjs')).default;
const health = (await import('./api/health.mjs')).default;

// --- /api/health ---
{
  const res = mockRes();
  await health({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200, 'health should be 200');
  assert.equal(res.jsonBody.ok, true, 'mock health ok=true');
  console.log('PASS /api/health ->', JSON.stringify(res.jsonBody));
}

// --- /api/chat happy path ---
{
  const res = mockRes();
  await chat({ method: 'POST', ip: '203.0.113.7', headers: {}, body: { text: 'Remember that I prefer medium roast coffee', user: 'smoke' } }, res);
  assert.equal(res.statusCode, 200, 'chat should be 200, got ' + JSON.stringify(res.jsonBody));
  assert.equal(res.jsonBody.user, 'smoke');
  assert.equal(typeof res.jsonBody.reply, 'string');
  assert.ok(res.jsonBody.reply.length > 0, 'reply non-empty');
  console.log('PASS /api/chat -> memoriesRecalled=' + res.jsonBody.memoriesRecalled + ' queued=' + res.jsonBody.memoryQueued);
}

// --- /api/memory ---
{
  const res = mockRes();
  await memory({ method: 'GET', headers: {}, query: { user: 'smoke' } }, res);
  assert.equal(res.statusCode, 200, 'memory should be 200');
  console.log('PASS /api/memory -> count=' + res.jsonBody.count);
}

// --- /api/chat bad input ---
{
  const res = mockRes();
  await chat({ method: 'POST', ip: '203.0.113.8', headers: {}, body: { text: '' } }, res);
  assert.equal(res.statusCode, 400, 'empty text -> 400');
  const res2 = mockRes();
  await chat({ method: 'GET', headers: {}, query: {} }, res2);
  assert.equal(res2.statusCode, 405, 'GET /api/chat -> 405');
  console.log('PASS /api/chat validation -> 400 + 405');
}

// --- rate limit: 30 req/min per IP (fast 400s — the limiter counts before
//     validation, so these are cheap and keep the whole loop inside the
//     60s window) ---
{
  const ip = '203.0.113.99';
  let last;
  for (let i = 0; i < 31; i += 1) {
    last = mockRes();
    await chat({ method: 'POST', ip, headers: {}, body: { text: '' } }, last);
    if (last.statusCode === 429) { assert.equal(i, 30, '429 at the 31st request'); break; }
  }
  assert.equal(last.statusCode, 429, 'rate limiter kicked in');
  assert.ok(last.headers['retry-after'], 'Retry-After header set');
  console.log('PASS /api/chat rate limit -> 429 with Retry-After=' + last.headers['retry-after']);
}

console.log('\nALL Vercel handler smoke tests passed.');
