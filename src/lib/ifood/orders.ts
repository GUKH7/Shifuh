import { getIfoodAccessToken } from "@/lib/ifood/catalog";

const IFOOD_MERCHANT_API_BASE_URL =
  process.env.IFOOD_MERCHANT_API_BASE_URL || "https://merchant-api.ifood.com.br";

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
    throw new Error(`iFood API ${response.status}: ${text || "request failed"}`);
  }

  return response.json() as Promise<T>;
}

export async function pollIfoodOrderEvents(merchantId: string) {
  const data = await ifoodOrderRequest<IfoodOrderEvent[]>(
    "/events/v1.0/events:polling?categories=FOOD&groups=ORDER_STATUS",
    {
      method: "GET",
      headers: {
        "x-polling-merchants": merchantId,
      },
    },
  );

  return Array.isArray(data) ? data : [];
}

export async function acknowledgeIfoodOrderEvents(eventIds: string[]) {
  if (eventIds.length === 0) return;

  await ifoodOrderRequest(
    "/events/v1.0/events/acknowledgment",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventIds),
    },
  );
}

export async function getIfoodOrderDetails(orderId: string) {
  return ifoodOrderRequest<Record<string, unknown>>(
    `/order/v1.0/orders/${orderId}`,
    { method: "GET" },
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
