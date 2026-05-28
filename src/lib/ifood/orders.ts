import { getIfoodAccessToken } from "@/lib/ifood/catalog";

const IFOOD_MERCHANT_API_BASE_URL =
  process.env.IFOOD_MERCHANT_API_BASE_URL || "https://merchant-api.ifood.com.br";

const DEFAULT_POLLING_CATEGORIES = "FOOD";

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
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<T | null> {
  const token = await getIfoodAccessToken();

  const response = await fetch(`${IFOOD_MERCHANT_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (response.status === 204) return null;

  if (!response.ok) {
    const text = await response.text();
    throw new IfoodApiError(response.status, text || "request failed");
  }

  return response.json() as Promise<T>;
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
    { method: "GET" },
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
  switch (code) {
    case "PLC":
      return "pending";
    case "CFM":
    case "RTP":
    case "SPS":
    case "SPE":
      return "preparing";
    case "DSP":
      return "delivering";
    case "CON":
      return "done";
    case "CAN":
      return "canceled";
    default:
      return "pending";
  }
}
