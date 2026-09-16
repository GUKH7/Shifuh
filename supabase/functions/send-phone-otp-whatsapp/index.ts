import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type SendSmsHookPayload = {
  user?: {
    phone?: string | null;
  };
  sms?: {
    otp?: string | null;
  };
};

type OtpRouteRow = {
  id: string;
  restaurant_id: string;
};

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_DELIVERY_TIMEOUT_MS = 3_500;
const STANDARD_WEBHOOK_SECRET_PREFIX = "v1,whsec_";
const LEGACY_WEBHOOK_SECRET_PREFIX = "whsec_";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hookErrorResponse(status: number, message: string) {
  return jsonResponse(status, {
    error: {
      http_code: status,
      message,
    },
  });
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeHookSecret(secret: string) {
  const trimmed = secret.trim();

  if (trimmed.startsWith(STANDARD_WEBHOOK_SECRET_PREFIX)) {
    return trimmed.slice(STANDARD_WEBHOOK_SECRET_PREFIX.length);
  }

  if (trimmed.startsWith(LEGACY_WEBHOOK_SECRET_PREFIX)) {
    return trimmed.slice(LEGACY_WEBHOOK_SECRET_PREFIX.length);
  }

  return trimmed;
}

function verifyHookPayload(rawBody: string, headers: Headers, configuredSecrets: string) {
  const candidates = configuredSecrets
    .split("|")
    .map((secret) => normalizeHookSecret(secret))
    .filter(Boolean);

  const webhookHeaders = Object.fromEntries(headers.entries());

  for (const secret of candidates) {
    try {
      return new Webhook(secret).verify(rawBody, webhookHeaders) as SendSmsHookPayload;
    } catch {
      // Support secret rotation: try the next configured signing secret.
    }
  }

  throw new Error("invalid webhook signature");
}

function normalizeBrazilPhone(value: string) {
  const digits = value.trim().replace(/\D/g, "");
  return /^55\d{10,11}$/.test(digits) ? `+${digits}` : "";
}

function resolveWhatsappEndpoint(baseUrl: string, restaurantId: string) {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("WhatsApp API must use HTTPS");
  }
  if (!UUID_PATTERN.test(restaurantId)) {
    throw new Error("Invalid restaurant id");
  }

  const basePath = parsed.pathname.replace(/\/$/, "");
  return `${parsed.origin}${basePath}/restaurants/${encodeURIComponent(restaurantId)}/send-message`;
}

async function findOtpRoute(
  supabaseUrl: string,
  serviceRoleKey: string,
  phone: string,
): Promise<OtpRouteRow | null> {
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/customer_phone_otp_routes`);
  url.searchParams.set("select", "id,restaurant_id");
  url.searchParams.set("phone", `eq.${phone}`);
  url.searchParams.set("consumed_at", "is.null");
  url.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(1_500),
  });

  if (!response.ok) {
    throw new Error(`OTP route lookup failed with HTTP ${response.status}`);
  }

  const rows = (await response.json()) as OtpRouteRow[];
  const route = rows[0] || null;
  if (!route || !UUID_PATTERN.test(route.id) || !UUID_PATTERN.test(route.restaurant_id)) {
    return null;
  }

  return route;
}

async function markOtpRouteConsumed(
  supabaseUrl: string,
  serviceRoleKey: string,
  routeId: string,
) {
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/customer_phone_otp_routes`);
  url.searchParams.set("id", `eq.${routeId}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(1_500),
  });

  if (!response.ok) {
    console.warn("Nao foi possivel marcar o contexto do OTP como consumido.", {
      status: response.status,
    });
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return hookErrorResponse(405, "Metodo nao permitido para o Send SMS Hook.");
  }

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET")?.trim() || "";
  const whatsappApiUrl = Deno.env.get("WHATSAPP_BOT_API_URL")?.trim() || "";
  const whatsappApiToken = Deno.env.get("WHATSAPP_BOT_API_TOKEN")?.trim() || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
  const deliveryTimeoutMs = Math.min(
    parsePositiveInteger(
      Deno.env.get("WHATSAPP_BOT_HOOK_DELIVERY_TIMEOUT_MS") || undefined,
      DEFAULT_DELIVERY_TIMEOUT_MS,
    ),
    4_000,
  );

  if (!hookSecret || !whatsappApiUrl || !whatsappApiToken || !supabaseUrl || !serviceRoleKey) {
    console.error("Hook de OTP por WhatsApp sem configuracao obrigatoria.");
    return hookErrorResponse(503, "O transporte de OTP por WhatsApp nao esta configurado.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return hookErrorResponse(413, "Payload do Send SMS Hook excede o limite permitido.");
  }

  let payload: SendSmsHookPayload;
  try {
    payload = verifyHookPayload(rawBody, request.headers, hookSecret);
  } catch {
    return hookErrorResponse(401, "Assinatura do Send SMS Hook invalida.");
  }

  const phone = normalizeBrazilPhone(String(payload.user?.phone || ""));
  const otp = String(payload.sms?.otp || "").trim();

  if (!phone || !/^\d{6}$/.test(otp)) {
    return hookErrorResponse(400, "Payload de telefone ou OTP invalido.");
  }

  let route: OtpRouteRow | null = null;
  try {
    route = await findOtpRoute(supabaseUrl, serviceRoleKey, phone);
  } catch {
    console.error("Falha ao consultar o contexto de restaurante do OTP.");
    return hookErrorResponse(503, "Nao foi possivel identificar a loja que deve enviar o codigo.");
  }

  if (!route) {
    return hookErrorResponse(
      400,
      "Solicite o codigo a partir da vitrine da loja para usar o WhatsApp correto do restaurante.",
    );
  }

  let endpoint: string;
  try {
    endpoint = resolveWhatsappEndpoint(whatsappApiUrl, route.restaurant_id);
  } catch {
    console.error("Endpoint HTTPS por restaurante do WhatsApp invalido.");
    return hookErrorResponse(503, "A configuracao do WhatsApp da loja e invalida.");
  }

  const message = [
    `Seu codigo de verificacao Shifuh e ${otp}.`,
    "Ele expira em poucos minutos.",
    "Nao compartilhe este codigo com ninguem.",
  ].join(" ");

  try {
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${whatsappApiToken}`,
      },
      body: JSON.stringify({ phone, message }),
      signal: AbortSignal.timeout(deliveryTimeoutMs),
    });

    if (!upstreamResponse.ok) {
      console.error("WhatsApp da loja recusou a entrega do OTP.", {
        status: upstreamResponse.status,
      });
      return hookErrorResponse(
        503,
        upstreamResponse.status === 503
          ? "O WhatsApp deste restaurante nao esta conectado no momento."
          : "O WhatsApp deste restaurante nao conseguiu enviar o codigo.",
      );
    }

    await markOtpRouteConsumed(supabaseUrl, serviceRoleKey, route.id);
    return jsonResponse(200, {});
  } catch {
    console.error("Falha de rede ao entregar OTP pelo WhatsApp da loja.");
    return hookErrorResponse(503, "Nao foi possivel enviar o codigo pelo WhatsApp deste restaurante.");
  }
});
