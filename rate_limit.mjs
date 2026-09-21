export function createRateLimiter({ windowMs = 60_000, max = 30, maxKeys = 10_000, keyFn }) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) throw new Error('windowMs must be positive');
  if (!Number.isInteger(max) || max <= 0) throw new Error('max must be positive');
  if (!Number.isInteger(maxKeys) || maxKeys <= 0) throw new Error('maxKeys must be positive');
  if (typeof keyFn !== 'function') throw new Error('keyFn is required');

  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = String(keyFn(req) || 'unknown');
    let current = buckets.get(key);

    if (current && current.resetAt <= now) {
      current = { count: 1, resetAt: now + windowMs };
      buckets.set(key, current);
      return next();
    }

    if (!current) {
      if (buckets.size >= maxKeys) {
        const oldestKey = buckets.keys().next().value;
        buckets.delete(oldestKey);
      }
      current = { count: 1, resetAt: now + windowMs };
      buckets.set(key, current);
      return next();
    }

    if (current.count >= max) {
      const retryAfterMs = Math.max(1, current.resetAt - now);
      res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({ error: 'too many requests' });
    }

    current.count += 1;
    return next();
  };
}
