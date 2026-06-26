import { NextResponse } from "next/server";

type RateLimitOptions = {
  keyPrefix: string;
  limit?: number;
  windowMs?: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 5000) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(request: Request, options: RateLimitOptions) {
  if (process.env.PUBLIC_API_RATE_LIMIT_DISABLED === "true") {
    return null;
  }

  const now = Date.now();
  const limit = readPositiveInteger(process.env.PUBLIC_API_RATE_LIMIT_MAX, options.limit ?? 20);
  const windowMs = readPositiveInteger(
    process.env.PUBLIC_API_RATE_LIMIT_WINDOW_MS,
    options.windowMs ?? 60_000,
  );
  const identity = getClientIp(request);
  const key = `${options.keyPrefix}:${identity}`;
  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + windowMs,
        };

  bucket.count += 1;
  buckets.set(key, bucket);
  cleanupExpiredBuckets(now);

  const remaining = Math.max(0, limit - bucket.count);
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const headers = {
    "Retry-After": String(resetSeconds),
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
  };

  if (bucket.count <= limit) {
    return null;
  }

  return NextResponse.json(
    { error: "Muitas tentativas. Aguarde alguns instantes e tente novamente." },
    { status: 429, headers },
  );
}

export function resetRateLimitForTests() {
  buckets.clear();
}
