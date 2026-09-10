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

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_SEND_PATH = "/send-message";
const DEFAULT_TIMEOUT_MS = 10_000;

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
  return trimmed.startsWith("v1,") ? trimmed.slice(3) : trimmed;
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

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET")?.trim() || "";
  const whatsappApiUrl = Deno.env.get("WHATSAPP_BOT_API_URL")?.trim() || "";
  const whatsappApiToken = Deno.env.get("WHATSAPP_BOT_API_TOKEN")?.trim() || "";
  const whatsappSendPath = Deno.env.get("WHATSAPP_BOT_SEND_MESSAGE_PATH")?.trim() || DEFAULT_SEND_PATH;
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

  let endpoint: string;
  try {
    endpoint = resolveWhatsappEndpoint(whatsappApiUrl, whatsappSendPath);
  } catch {
    console.error("Endpoint HTTPS do WhatsApp invalido.");
    return jsonResponse(503, { error: "delivery_unavailable" });
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
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!upstreamResponse.ok) {
      console.error("API do WhatsApp recusou a entrega do OTP.", { status: upstreamResponse.status });
      return jsonResponse(502, { error: "delivery_failed" });
    }

    return jsonResponse(200, {});
  } catch {
    console.error("Falha de rede ao entregar OTP via WhatsApp.");
    return jsonResponse(502, { error: "delivery_failed" });
  }
});
