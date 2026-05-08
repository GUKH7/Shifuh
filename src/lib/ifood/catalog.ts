const IFOOD_MERCHANT_API_BASE_URL =
  process.env.IFOOD_MERCHANT_API_BASE_URL || "https://merchant-api.ifood.com.br";

const IFOOD_AUTH_URL =
  process.env.IFOOD_AUTH_URL ||
  `${IFOOD_MERCHANT_API_BASE_URL}/authentication/v1.0/oauth/token`;

type IfoodTokenResponse = {
  accessToken: string;
  type?: string;
  expiresIn?: number;
};

type CachedIfoodToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: CachedIfoodToken | null = null;

export type IfoodCatalog = {
  catalogId: string;
  context?: string[];
  status?: string;
  modifiedAt?: number;
};

export type IfoodCategory = {
  id: string;
  name: string;
  sequence?: number;
  status?: string;
  template?: string;
};

export type IfoodSellableItem = {
  itemId?: string;
  categoryId?: string;
  itemName?: string;
  itemDescription?: string;
  itemPrice?: {
    value?: number;
    originalValue?: number;
  };
  logosUrls?: string[];
  status?: string;
};

function getIfoodCredentials() {
  const clientId = process.env.IFOOD_CLIENT_ID?.trim();
  const clientSecret = process.env.IFOOD_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Credenciais do iFood ausentes. Adicione IFOOD_CLIENT_ID e IFOOD_CLIENT_SECRET ao ambiente do servidor.",
    );
  }

  return { clientId, clientSecret };
}

function getCachedIfoodToken() {
  if (!cachedToken) return null;

  const safetyWindowMs = 60_000;
  if (Date.now() >= cachedToken.expiresAt - safetyWindowMs) {
    cachedToken = null;
    return null;
  }

  return cachedToken.accessToken;
}

async function requestIfoodAccessToken() {
  const { clientId, clientSecret } = getIfoodCredentials();

  const body = new URLSearchParams({
    grantType: "client_credentials",
    clientId,
    clientSecret,
  });

  const response = await fetch(IFOOD_AUTH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Falha ao autenticar no iFood (${response.status}). ${text || "Verifique client_id, client_secret e escopos liberados."}`,
    );
  }

  const data = (await response.json()) as IfoodTokenResponse;
  if (!data.accessToken) {
    throw new Error("O iFood não retornou accessToken na autenticação OAuth.");
  }

  const expiresInMs = Math.max((data.expiresIn || 21_600) * 1000, 300_000);
  cachedToken = {
    accessToken: data.accessToken,
    expiresAt: Date.now() + expiresInMs,
  };

  return data.accessToken;
}

export async function getIfoodAccessToken() {
  const token = getCachedIfoodToken();
  if (token) return token;
  return requestIfoodAccessToken();
}

export async function validateIfoodCredentials() {
  const token = await getIfoodAccessToken();
  return { ok: true, tokenPreview: `${token.slice(0, 12)}...` };
}

async function ifoodRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIfoodAccessToken();
  const response = await fetch(`${IFOOD_MERCHANT_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`iFood API ${response.status}: ${text || "request failed"}`);
  }

  return response.json() as Promise<T>;
}

export async function listIfoodCatalogs(merchantId: string) {
  return ifoodRequest<IfoodCatalog[]>(
    `/catalog/v2.0/merchants/${merchantId}/catalogs`,
  );
}

export async function listIfoodCategories(merchantId: string, catalogId: string) {
  return ifoodRequest<IfoodCategory[]>(
    `/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/categories`,
  );
}

export async function listIfoodSellableItems(merchantId: string, catalogId: string) {
  return ifoodRequest<IfoodSellableItem[]>(
    `/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/sellableItems`,
  );
}

export function pickMainCatalog(catalogs: IfoodCatalog[]) {
  if (catalogs.length === 0) return null;
  return (
    catalogs.find((catalog) => catalog.context?.includes("DEFAULT")) ||
    catalogs.find((catalog) => catalog.status === "AVAILABLE") ||
    catalogs[0]
  );
}
