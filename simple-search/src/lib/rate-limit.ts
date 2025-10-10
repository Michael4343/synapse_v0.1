const requestLog = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): RateLimitResult {
  const now = Date.now();
  const existing = requestLog.get(key) ?? [];
  const recent = existing.filter(timestamp => now - timestamp < windowMs);

  if (recent.length >= maxRequests) {
    const retryAfterMs = windowMs - (now - recent[0]);
    requestLog.set(key, recent);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, retryAfterMs)
    };
  }

  recent.push(now);
  requestLog.set(key, recent);
  return { allowed: true };
}

export function clearRateLimit(key: string) {
  requestLog.delete(key);
}
