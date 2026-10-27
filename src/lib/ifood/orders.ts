import { getIfoodAccessToken } from "@/lib/ifood/catalog";

const IFOOD_MERCHANT_API_BASE_URL =
  process.env.IFOOD_MERCHANT_API_BASE_URL || "https://merchant-api.ifood.com.br";

const DEFAULT_POLLING_CATEGORIES = "FOOD";
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
// Never hold a serverless request open for a multi-minute upstream cooldown.
const MAX_INLINE_RETRY_DELAY_MS = 2_500;
const MAX_RETRY_AFTER_MS = 15 * 60_000;

export class IfoodApiError extends Error {
  status: number;
  responseBody: string;
  retryAfterMs: number | null;

  constructor(status: number, responseBody: string, retryAfterMs: number | null = null) {
    super(`iFood API ${status}: ${responseBody || "request failed"}`);
    this.name = "IfoodApiError";
    this.status = status;
    this.responseBody = responseBody;
    this.retryAfterMs = retryAfterMs;
  }
}

export type IfoodOrderEvent = {
  id: string;
  code: string;
  fullCode?: string;
  orderId: string;
  merchantId: string;
  createdAt?: string;
  metadata?: {
    group?: string;
  };
  [key: string]: unknown;
};

// Prefer the longest valid server hint. iFood/Cloudflare may put retry_after
// in the JSON error body instead of the standard Retry-After header.
export function readIfoodRetryAfterMs(
  headers: Headers,
  responseBody: string,
  now = Date.now(),
): number | null {
  const candidates: number[] = [];
  const header = headers.get("retry-after")?.trim();
  if (header) {
    const seconds = Number(header);
    if (/^\d+(?:\.\d+)?$/.test(header) && Number.isFinite(seconds)) {
      candidates.push(seconds * 1_000);
    } else {
      const when = Date.parse(header);
      if (Number.isFinite(when)) candidates.push(Math.max(0, when - now));
    }
  }

  try {
    const payload = JSON.parse(responseBody) as { retry_after?: unknown };
    if (typeof payload.retry_after === "number" &&
        Number.isFinite(payload.retry_after) &&
        payload.retry_after >= 0) {
      candidates.push(payload.retry_after * 1_000);
    }
  } catch {
    // Non-JSON upstream failures may still contain a valid Retry-After header.
  }

  if (!candidates.length) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ...candidates));
}

async function ifoodOrderRequest<T>(
  path: string,
  init?: RequestInit & {
    headers?: Record<string, string>;
    retry?: boolean;
    retryAttempts?: number;
  },
): Promise<T | null> {
  const token = await getIfoodAccessToken();
  const retry = Boolean(init?.retry);
  const maxAttempts = retry
    ? Math.max(1, init?.retryAttempts || DEFAULT_RETRY_ATTEMPTS)
    : 1;
  const { retry: _retry, retryAttempts: _retryAttempts, ...requestInit } = init || {};

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(`${IFOOD_MERCHANT_API_BASE_URL}${path}`, {
        ...requestInit,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(requestInit.headers || {}),
        },
        cache: "no-store",
        signal: requestInit.signal
          ? AbortSignal.any([requestInit.signal, AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)])
          : AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Do not retry an ACK after its lease owner aborts the request.
      if (requestInit.signal?.aborted) throw error;
      if (attempt < maxAttempts) {
        await waitForRetry(attempt, null, requestInit.signal ?? undefined);
        continue;
      }

      throw error;
    }

    if (response.status === 204) return null;

    if (!response.ok) {
      const text = await response.text();
      const retryAfterMs = readIfoodRetryAfterMs(response.headers, text);
      if (retry && shouldRetryStatus(response.status) && attempt < maxAttempts &&
          (retryAfterMs === null || retryAfterMs <= MAX_INLINE_RETRY_DELAY_MS)) {
        await waitForRetry(attempt, retryAfterMs, requestInit.signal ?? undefined);
        continue;
      }
      // Respect long cooldowns by returning the error to the scheduler;
      // do not hammer the iFood API or sleep 120s inside a 60s function.
      throw new IfoodApiError(response.status, text || "request failed", retryAfterMs);
    }

    const text = await response.text();
    if (!text.trim()) return null;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new IfoodApiError(response.status, text);
    }
  }

  return null;
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function waitForRetry(
  attempt: number,
  serverDelayMs: number | null = null,
  signal?: AbortSignal,
): Promise<void> {
  const jitter = Math.floor(Math.random() * 150);
  const backoff = DEFAULT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitter;
  const delay = Math.max(backoff, serverDelayMs ?? 0);
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new Error("iFood transport canceled."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function pollIfoodOrderEvents(merchantId: string, signal?: AbortSignal) {
  const params = new URLSearchParams();
  const categories = process.env.IFOOD_POLLING_CATEGORIES?.trim() || DEFAULT_POLLING_CATEGORIES;
  const groups = process.env.IFOOD_POLLING_GROUPS?.trim();
  const types = process.env.IFOOD_POLLING_TYPES?.trim();

  if (categories) params.set("categories", categories);
  if (groups) params.set("groups", groups);
  if (types) params.set("types", types);
  if (process.env.IFOOD_POLLING_EXCLUDE_HEARTBEAT === "true") {
    params.set("excludeHeartbeat", "true");
  }

  const query = params.toString();
  const path = `/events/v1.0/events:polling${query ? `?${query}` : ""}`;

  const data = await ifoodOrderRequest<IfoodOrderEvent[]>(path, {
    method: "GET",
    retry: true,
    headers: {
      "x-polling-merchants": merchantId,
    },
    signal,
  });

  return Array.isArray(data) ? data : [];
}

export async function acknowledgeIfoodOrderEvents(eventIds: string[], signal?: AbortSignal) {
  if (eventIds.length === 0) return;
  const uniqueEventIds = Array.from(new Set(eventIds));

  await ifoodOrderRequest(
    "/events/v1.0/events/acknowledgment",
    {
      method: "POST",
      retry: true,
      retryAttempts: 4,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(uniqueEventIds.map((id) => ({ id }))),
      signal,
    },
  );
}

export async function getIfoodOrderDetails(orderId: string, signal?: AbortSignal) {
  return ifoodOrderRequest<Record<string, unknown>>(
    `/order/v1.0/orders/${orderId}`,
    { method: "GET", retry: true, signal },
  );
}

export async function confirmIfoodOrder(orderId: string) {
  return ifoodOrderRequest<null>(`/order/v1.0/orders/${orderId}/confirm`, {
    method: "POST",
  });
}

export async function dispatchIfoodOrder(orderId: string) {
  return ifoodOrderRequest<null>(`/order/v1.0/orders/${orderId}/dispatch`, {
    method: "POST",
  });
}

export async function readyToPickupIfoodOrder(orderId: string) {
  return ifoodOrderRequest<null>(`/order/v1.0/orders/${orderId}/readyToPickup`, {
    method: "POST",
  });
}

export async function getIfoodCancellationReasons(orderId: string) {
  return ifoodOrderRequest<Record<string, unknown>[] | Record<string, unknown>>(
    `/order/v1.0/orders/${orderId}/cancellationReasons`,
    { method: "GET" },
  );
}

export async function requestIfoodOrderCancellation(
  orderId: string,
  cancellationCode: string,
  reason: string,
) {
  return ifoodOrderRequest<Record<string, unknown>>(
    `/order/v1.0/orders/${orderId}/requestCancellation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cancellationCode,
        reason,
      }),
    },
  );
}

export function mapIfoodEventCodeToStatus(code: string) {
  switch (code.toUpperCase()) {
    case "PLC":
    case "PLACED":
      return "pending";
    case "CFM":
    case "CONFIRMED":
    case "RTP":
    case "READY_TO_PICKUP":
    case "SPS":
    case "SEPARATION_STARTED":
    case "SPE":
    case "SEPARATION_ENDED":
      return "preparing";
    case "DSP":
    case "DISPATCHED":
      return "delivering";
    case "CON":
    case "CONCLUDED":
      return "done";
    case "CAN":
    case "CANCELLED":
      return "canceled";
    default:
      return null;
  }
}
