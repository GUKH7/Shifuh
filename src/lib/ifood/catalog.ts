import {
  getIfoodTokenEnvironment,
  persistIfoodToken,
  readPersistedIfoodToken,
} from "@/lib/ifood/auth-store";
import {
  isIfoodTokenEncryptionKeyConfigured,
  requireIfoodTokenEncryptionKey,
} from "@/lib/ifood/token-encryption-config";

const IFOOD_MERCHANT_API_BASE_URL =
  process.env.IFOOD_MERCHANT_API_BASE_URL || "https://merchant-api.ifood.com.br";
const IFOOD_AUTH_URL =
  process.env.IFOOD_AUTH_URL ||
  `${IFOOD_MERCHANT_API_BASE_URL}/authentication/v1.0/oauth/token`;
const REQUEST_TIMEOUT_MS = 15_000;

type IfoodTokenResponse = { accessToken: string; type?: string; expiresIn?: number };
type CachedIfoodToken = { accessToken: string; expiresAt: number; source: "memory" | "database" | "oauth" };

let cachedToken: CachedIfoodToken | null = null;
let tokenRequest: Promise<CachedIfoodToken> | null = null;

export class IfoodAuthenticationError extends Error {
  code: "missing_credentials" | "invalid_credentials" | "missing_scope" | "temporarily_unavailable" | "invalid_response" | "token_storage";
  status: number | null;

  constructor(code: IfoodAuthenticationError["code"], message: string, status: number | null = null) {
    super(message);
    this.name = "IfoodAuthenticationError";
    this.code = code;
    this.status = status;
  }
}

export type IfoodCatalog = { catalogId: string; context?: string[]; status?: string; modifiedAt?: number };
export type IfoodCategory = { id: string; name: string; sequence?: number; status?: string; template?: string };
export type IfoodSellableItem = {
  itemId?: string;
  categoryId?: string;
  itemName?: string;
  itemDescription?: string;
  itemPrice?: { value?: number; originalValue?: number };
  logosUrls?: string[];
  status?: string;
};

function getIfoodCredentials() {
  const clientId = process.env.IFOOD_CLIENT_ID?.trim();
  const clientSecret = process.env.IFOOD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new IfoodAuthenticationError(
      "missing_credentials",
      "As credenciais oficiais do iFood não estão configuradas neste ambiente.",
    );
  }
  return { clientId, clientSecret };
}

function logAuthenticationFailure(error: unknown) {
  const safe = error instanceof IfoodAuthenticationError
    ? { name: error.name, code: error.code, status: error.status, message: error.message }
    : { name: "UnknownError", message: error instanceof Error ? error.message : "Falha desconhecida" };
  console.error("Falha de autenticação do iFood", safe);
}

function classifyOAuthFailure(status: number, body: string) {
  const normalized = body.toLowerCase();
  if (status === 401 || normalized.includes("invalid_client")) {
    return new IfoodAuthenticationError("invalid_credentials", "Client ID ou Client Secret rejeitados pelo iFood.", status);
  }
  if (status === 403 || normalized.includes("scope") || normalized.includes("permission")) {
    return new IfoodAuthenticationError("missing_scope", "As credenciais são válidas, mas os escopos necessários ainda não foram liberados.", status);
  }
  if (status === 429 || status >= 500) {
    return new IfoodAuthenticationError("temporarily_unavailable", "A autenticação do iFood está temporariamente indisponível.", status);
  }
  return new IfoodAuthenticationError("invalid_credentials", "O iFood recusou a autenticação do aplicativo.", status);
}

function memoryToken() {
  if (!cachedToken || Date.now() >= cachedToken.expiresAt - 60_000) {
    cachedToken = null;
    return null;
  }
  return cachedToken;
}

async function requestIfoodAccessToken(): Promise<CachedIfoodToken> {
  const { clientId, clientSecret } = getIfoodCredentials();
  try {
    requireIfoodTokenEncryptionKey();
  } catch (error) {
    throw new IfoodAuthenticationError(
      "token_storage",
      error instanceof Error
        ? error.message
        : "A chave de criptografia do token do iFood está inválida.",
    );
  }

  const response = await fetch(IFOOD_AUTH_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grantType: "client_credentials", clientId, clientSecret }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) throw classifyOAuthFailure(response.status, body);

  let data: IfoodTokenResponse;
  try {
    data = JSON.parse(body) as IfoodTokenResponse;
  } catch {
    throw new IfoodAuthenticationError("invalid_response", "O iFood retornou uma resposta OAuth inválida.", response.status);
  }
  if (!data.accessToken) {
    throw new IfoodAuthenticationError("invalid_response", "O iFood não retornou um token de acesso.", response.status);
  }

  const expiresAt = Date.now() + Math.max((data.expiresIn || 21_600) * 1000, 300_000);
  try {
    await persistIfoodToken(data.accessToken, expiresAt);
  } catch {
    throw new IfoodAuthenticationError("token_storage", "O token foi obtido, mas não pôde ser armazenado com segurança.");
  }

  return { accessToken: data.accessToken, expiresAt, source: "oauth" };
}

export async function getIfoodAccessToken() {
  const memory = memoryToken();
  if (memory) return memory.accessToken;

  try {
    const persisted = await readPersistedIfoodToken();
    if (persisted) {
      cachedToken = { ...persisted, source: "database" };
      return cachedToken.accessToken;
    }
  } catch (error) {
    logAuthenticationFailure(error);
  }

  if (!tokenRequest) {
    tokenRequest = requestIfoodAccessToken()
      .then((token) => (cachedToken = token))
      .catch((error) => {
        logAuthenticationFailure(error);
        throw error;
      })
      .finally(() => { tokenRequest = null; });
  }
  return (await tokenRequest).accessToken;
}

export async function validateIfoodCredentials() {
  const startedAt = Date.now();
  const accessToken = await getIfoodAccessToken();
  return {
    ok: true,
    environment: getIfoodTokenEnvironment(),
    clientIdConfigured: Boolean(process.env.IFOOD_CLIENT_ID?.trim()),
    clientSecretConfigured: Boolean(process.env.IFOOD_CLIENT_SECRET?.trim()),
    encryptionKeyConfigured: isIfoodTokenEncryptionKeyConfigured(),
    tokenSource: cachedToken?.source || "unknown",
    expiresAt: cachedToken ? new Date(cachedToken.expiresAt).toISOString() : null,
    latencyMs: Date.now() - startedAt,
    tokenReceived: Boolean(accessToken),
  };
}

export async function ifoodRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIfoodAccessToken();
  const response = await fetch(`${IFOOD_MERCHANT_API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
    signal: init?.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`iFood API ${response.status}: ${text || "request failed"}`);
  }
  if (response.status === 204) return null as T;
  const text = await response.text();
  return text.trim() ? JSON.parse(text) as T : null as T;
}

export async function listIfoodCatalogs(merchantId: string) {
  return ifoodRequest<IfoodCatalog[]>(`/catalog/v2.0/merchants/${merchantId}/catalogs`);
}
export async function listIfoodCategories(merchantId: string, catalogId: string) {
  return ifoodRequest<IfoodCategory[]>(`/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/categories`);
}
export async function listIfoodSellableItems(merchantId: string, catalogId: string) {
  return ifoodRequest<IfoodSellableItem[]>(`/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/sellableItems`);
}
export function pickMainCatalog(catalogs: IfoodCatalog[]) {
  if (catalogs.length === 0) return null;
  return catalogs.find((catalog) => catalog.context?.includes("DEFAULT")) || catalogs.find((catalog) => catalog.status === "AVAILABLE") || catalogs[0];
}
