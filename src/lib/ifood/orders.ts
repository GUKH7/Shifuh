import { getIfoodAccessToken } from "@/lib/ifood/catalog";

const IFOOD_MERCHANT_API_BASE_URL =
  process.env.IFOOD_MERCHANT_API_BASE_URL || "https://merchant-api.ifood.com.br";

const DEFAULT_POLLING_CATEGORIES = "FOOD";
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export class IfoodApiError extends Error {
  status: number;
  responseBody: string;

  constructor(status: number, responseBody: string) {
    super(`iFood API ${status}: ${responseBody || "request failed"}`);
    this.name = "IfoodApiError";
    this.status = status;
    this.responseBody = responseBody;
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

  let lastTransientBody = "";

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
        signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt < maxAttempts) {
        await waitForRetry(attempt);
        continue;
      }

      throw error;
    }

    if (shouldRetryStatus(response.status) && attempt < maxAttempts) {
      lastTransientBody = await response.text().catch(() => "");
      await waitForRetry(attempt);
      continue;
    }

    if (response.status === 204) return null;

    if (!response.ok) {
      const text = await response.text();
      throw new IfoodApiError(response.status, text || lastTransientBody || "request failed");
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

function waitForRetry(attempt: number) {
  const jitter = Math.floor(Math.random() * 150);
  const delay = DEFAULT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitter;

  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function pollIfoodOrderEvents(merchantId: string) {
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
  });

  return Array.isArray(data) ? data : [];
}

export async function acknowledgeIfoodOrderEvents(eventIds: string[]) {
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
    },
  );
}

export async function getIfoodOrderDetails(orderId: string) {
  return ifoodOrderRequest<Record<string, unknown>>(
    `/order/v1.0/orders/${orderId}`,
    { method: "GET", retry: true },
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
