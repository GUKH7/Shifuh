import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type RateLimitOptions = {
  keyPrefix: string;
  limit?: number;
  windowMs?: number;
};

type DistributedRateLimitResult = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
};

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getClientIp(request: Request) {
  const vercelForwardedFor = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return (
    vercelForwardedFor ||
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function getHashSecret() {
  const secret = process.env.RATE_LIMIT_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Rate limit hash secret is not configured.");
  return secret;
}

function normalizeResult(data: unknown): DistributedRateLimitResult | null {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const remaining = Number(row.remaining);
  const resetAt = typeof row.reset_at === "string" ? row.reset_at : "";
  if (typeof row.allowed !== "boolean" || !Number.isFinite(remaining) || !resetAt) {
    return null;
  }

  return {
    allowed: row.allowed,
    remaining: Math.max(0, Math.floor(remaining)),
    reset_at: resetAt,
  };
}

function unavailableResponse() {
  return NextResponse.json(
    { error: "Não foi possível validar a requisição agora. Tente novamente em instantes." },
    {
      status: 503,
      headers: {
        "Retry-After": "5",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function checkRateLimit(request: Request, options: RateLimitOptions) {
  if (process.env.PUBLIC_API_RATE_LIMIT_DISABLED === "true") return null;

  const limit = readPositiveInteger(
    process.env.PUBLIC_API_RATE_LIMIT_MAX,
    options.limit ?? 20,
  );
  const windowMs = readPositiveInteger(
    process.env.PUBLIC_API_RATE_LIMIT_WINDOW_MS,
    options.windowMs ?? 60_000,
  );
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const identity = getClientIp(request);
    const keyHash = createHmac("sha256", getHashSecret())
      .update(`${options.keyPrefix}:${identity}`)
      .digest("hex");
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc("consume_api_rate_limit", {
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) throw new Error(error.message || "Distributed rate limit RPC failed.");

    const result = normalizeResult(data);
    if (!result) throw new Error("Distributed rate limit returned an invalid result.");
    if (result.allowed) return null;

    const parsedResetAt = new Date(result.reset_at).getTime();
    const resetAt = Number.isFinite(parsedResetAt) ? parsedResetAt : Date.now() + windowMs;
    const resetSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns instantes e tente novamente." },
      {
        status: 429,
        headers: {
          "Retry-After": String(resetSeconds),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(result.remaining),
          "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(`Rate limit distribuído indisponível (${options.keyPrefix}):`, error);
    return unavailableResponse();
  }
}

// Compatibilidade temporária com testes legados; não existe estado local para limpar.
export function resetRateLimitForTests() {}
