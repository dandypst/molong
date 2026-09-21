import test from 'node:test';
import assert from 'node:assert/strict';

import { createRateLimiter } from '../rate_limit.mjs';

function request(ip = '192.0.2.10', user = 'alice') {
  return { ip, body: { user } };
}

function response() {
  const headers = {};
  let statusValue;
  let body;
  return {
    headers,
    get statusValue() { return statusValue; },
    get body() { return body; },
    set(name, value) { headers[name.toLowerCase()] = value; },
    status(code) { statusValue = code; return this; },
    json(value) { body = value; return this; },
  };
}

test('createRateLimiter allows requests up to the configured limit', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, keyFn: req => req.ip });
  const nextCalls = [];

  for (let i = 0; i < 2; i += 1) {
    const res = response();
    limiter(request(), res, () => nextCalls.push(i));
    assert.equal(res.statusValue, undefined);
  }

  const res = response();
  limiter(request(), res, () => nextCalls.push('unexpected'));
  assert.equal(res.statusValue, 429);
  assert.equal(res.body.error, 'too many requests');
  assert.equal(nextCalls.length, 2);
});

test('createRateLimiter keeps the bucket table bounded', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 2, keyFn: req => req.ip });

  for (const ip of ['192.0.2.10', '192.0.2.11']) {
    const res = response();
    limiter(request(ip), res, () => {});
    assert.equal(res.statusValue, undefined);
  }

  const third = response();
  limiter(request('192.0.2.12'), third, () => {});
  assert.equal(third.statusValue, undefined);

  const evicted = response();
  limiter(request('192.0.2.10'), evicted, () => {});
  assert.equal(evicted.statusValue, undefined);
});
