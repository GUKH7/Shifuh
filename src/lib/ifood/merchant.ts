import { getIfoodAccessToken } from "@/lib/ifood/catalog";

const IFOOD_MERCHANT_API_BASE_URL =
  process.env.IFOOD_MERCHANT_API_BASE_URL || "https://merchant-api.ifood.com.br";

type IfoodMerchantRequestInit = RequestInit & {
  headers?: Record<string, string>;
};

export type IfoodOpeningHourShift = {
  id?: string;
  dayOfWeek: string;
  start: string;
  duration: number;
};

export type IfoodCreateInterruptionPayload = {
  description: string;
  start: string;
  end: string;
};

async function ifoodMerchantRequest<T>(
  path: string,
  init?: IfoodMerchantRequestInit,
): Promise<T | null> {
  const token = await getIfoodAccessToken();
  const response = await fetch(`${IFOOD_MERCHANT_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (response.status === 204) return null;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`iFood Merchant API ${response.status}: ${text || "request failed"}`);
  }

  return response.json() as Promise<T>;
}

export function listIfoodMerchants() {
  return ifoodMerchantRequest<Record<string, unknown>[] | Record<string, unknown>>(
    "/merchant/v1.0/merchants",
  );
}

export function getIfoodMerchantDetails(merchantId: string) {
  return ifoodMerchantRequest<Record<string, unknown>>(
    `/merchant/v1.0/merchants/${merchantId}`,
  );
}

export function getIfoodMerchantStatus(merchantId: string) {
  return ifoodMerchantRequest<Record<string, unknown>>(
    `/merchant/v1.0/merchants/${merchantId}/status`,
  );
}

export function listIfoodMerchantInterruptions(merchantId: string) {
  return ifoodMerchantRequest<Record<string, unknown>[] | Record<string, unknown>>(
    `/merchant/v1.0/merchants/${merchantId}/interruptions`,
  );
}

export function createIfoodMerchantInterruption(
  merchantId: string,
  payload: IfoodCreateInterruptionPayload,
) {
  return ifoodMerchantRequest<Record<string, unknown>>(
    `/merchant/v1.0/merchants/${merchantId}/interruptions`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteIfoodMerchantInterruption(merchantId: string, interruptionId: string) {
  return ifoodMerchantRequest<null>(
    `/merchant/v1.0/merchants/${merchantId}/interruptions/${interruptionId}`,
    {
      method: "DELETE",
    },
  );
}

export function getIfoodMerchantOpeningHours(merchantId: string) {
  return ifoodMerchantRequest<{ shifts?: IfoodOpeningHourShift[] } | IfoodOpeningHourShift[]>(
    `/merchant/v1.0/merchants/${merchantId}/opening-hours`,
  );
}

export function setIfoodMerchantOpeningHours(
  merchantId: string,
  shifts: IfoodOpeningHourShift[],
) {
  return ifoodMerchantRequest<{ shifts?: IfoodOpeningHourShift[] } | IfoodOpeningHourShift[]>(
    `/merchant/v1.0/merchants/${merchantId}/opening-hours`,
    {
      method: "PUT",
      body: JSON.stringify({
        storeId: merchantId,
        shifts,
      }),
    },
  );
}
