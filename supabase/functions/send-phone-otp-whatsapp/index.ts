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

type WhatsappStatusPayload = {
  status?: string;
};

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_SEND_PATH = "/send-message";
const DEFAULT_STATUS_PATH = "/status";
const DEFAULT_TIMEOUT_MS = 10_000;
const PREFLIGHT_TIMEOUT_MS = 2_000;
const STANDARD_WEBHOOK_SECRET_PREFIX = "v1,whsec_";
const LEGACY_WEBHOOK_SECRET_PREFIX = "whsec_";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

function resolveWhatsappEndpoint(baseUrl: string, path: string) {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("WhatsApp API must use HTTPS");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}${normalizedPath}`;
}

async function isWhatsappReady(statusEndpoint: string, apiToken: string) {
  try {
    const response = await fetch(statusEndpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("API do WhatsApp recusou a verificacao de status.", { status: response.status });
      return false;
    }

    const payload = (await response.json()) as WhatsappStatusPayload;
    return payload.status === "conectado";
  } catch {
    console.error("API do WhatsApp indisponivel durante verificacao de status.");
    return false;
  }
}

async function deliverWhatsappOtp(
  endpoint: string,
  apiToken: string,
  phone: string,
  message: string,
  timeoutMs: number,
) {
  try {
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ phone, message }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!upstreamResponse.ok) {
      console.error("API do WhatsApp recusou a entrega do OTP.", { status: upstreamResponse.status });
      return;
    }

    console.info("API do WhatsApp aceitou a entrega do OTP.");
  } catch {
    console.error("Falha de rede ao entregar OTP via WhatsApp.");
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET")?.trim() || "";
  const whatsappApiUrl = Deno.env.get("WHATSAPP_BOT_API_URL")?.trim() || "";
  const whatsappApiToken = Deno.env.get("WHATSAPP_BOT_API_TOKEN")?.trim() || "";
  const whatsappSendPath = Deno.env.get("WHATSAPP_BOT_SEND_MESSAGE_PATH")?.trim() || DEFAULT_SEND_PATH;
  const whatsappStatusPath = Deno.env.get("WHATSAPP_BOT_STATUS_PATH")?.trim() || DEFAULT_STATUS_PATH;
  const timeoutMs = parsePositiveInteger(Deno.env.get("WHATSAPP_BOT_TIMEOUT_MS") || undefined, DEFAULT_TIMEOUT_MS);

  if (!hookSecret || !whatsappApiUrl || !whatsappApiToken) {
    console.error("Hook de OTP por WhatsApp sem configuracao obrigatoria.");
    return jsonResponse(503, { error: "delivery_unavailable" });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "payload_too_large" });
  }

  let payload: SendSmsHookPayload;
  try {
    payload = verifyHookPayload(rawBody, request.headers, hookSecret);
  } catch {
    return jsonResponse(401, { error: "invalid_signature" });
  }

  const phone = String(payload.user?.phone || "").trim();
  const otp = String(payload.sms?.otp || "").trim();

  if (!/^\+55\d{10,11}$/.test(phone) || !/^\d{6}$/.test(otp)) {
    return jsonResponse(400, { error: "invalid_auth_payload" });
  }

  let sendEndpoint: string;
  let statusEndpoint: string;
  try {
    sendEndpoint = resolveWhatsappEndpoint(whatsappApiUrl, whatsappSendPath);
    statusEndpoint = resolveWhatsappEndpoint(whatsappApiUrl, whatsappStatusPath);
  } catch {
    console.error("Endpoint HTTPS do WhatsApp invalido.");
    return jsonResponse(503, { error: "delivery_unavailable" });
  }

  if (!(await isWhatsappReady(statusEndpoint, whatsappApiToken))) {
    console.error("WhatsApp nao esta pronto para receber OTPs.");
    return jsonResponse(503, { error: "delivery_unavailable" });
  }

  const message = [
    `Seu codigo de verificacao Shifuh e ${otp}.`,
    "Ele expira em poucos minutos.",
    "Nao compartilhe este codigo com ninguem.",
  ].join(" ");

  // Supabase HTTP Auth Hooks have a short response deadline. The authenticated
  // transport preflight above fails closed; the slower Baileys send continues
  // as an Edge Runtime background task so Auth is not held open by WhatsApp.
  EdgeRuntime.waitUntil(
    deliverWhatsappOtp(sendEndpoint, whatsappApiToken, phone, message, timeoutMs),
  );

  return jsonResponse(200, {});
});