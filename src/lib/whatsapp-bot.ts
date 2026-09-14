type SendWhatsappMessageInput = {
  phone: string;
  message: string;
  restaurantId?: string;
  orderId?: string;
  status?: string;
};

type SendWhatsappMessageResult = {
  ok: boolean;
  skipped: boolean;
  error?: string;
};

function normalizeBrazilianWhatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("55")) return digits;

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function getWhatsappBotBaseUrl() {
  return (process.env.WHATSAPP_BOT_API_URL || "").replace(/\/+$/, "");
}

function getWhatsappBotSendPath() {
  const configuredPath = process.env.WHATSAPP_BOT_SEND_MESSAGE_PATH || "/send-message";
  return configuredPath.startsWith("/") ? configuredPath : `/${configuredPath}`;
}

export function isWhatsappBotConfigured() {
  return Boolean(getWhatsappBotBaseUrl());
}

export function buildWhatsappBotUrl(path: string) {
  const baseUrl = getWhatsappBotBaseUrl();

  if (!baseUrl) return null;

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildWhatsappRestaurantBotUrl(restaurantId: string, path: string) {
  const baseUrl = getWhatsappBotBaseUrl();
  const normalizedRestaurantId = restaurantId?.trim();
  if (!baseUrl || !normalizedRestaurantId) return null;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}/restaurants/${encodeURIComponent(normalizedRestaurantId)}${normalizedPath}`;
}

export function buildWhatsappBotHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  const token = process.env.WHATSAPP_BOT_API_TOKEN?.trim();

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return headers;
}

export function getWhatsappBotRequestSignal() {
  const timeoutMs = Number(process.env.WHATSAPP_BOT_TIMEOUT_MS || 10000);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

export async function sendWhatsappMessage({
  phone,
  message,
  restaurantId,
  orderId,
  status,
}: SendWhatsappMessageInput): Promise<SendWhatsappMessageResult> {
  const baseUrl = getWhatsappBotBaseUrl();

  if (!baseUrl) {
    return {
      ok: false,
      skipped: true,
      error: "WHATSAPP_BOT_API_URL não configurada.",
    };
  }

  const normalizedPhone = normalizeBrazilianWhatsappPhone(phone);

  if (!normalizedPhone) {
    return {
      ok: false,
      skipped: false,
      error: "Telefone do cliente inválido para envio via WhatsApp.",
    };
  }

  const sendUrl = restaurantId
    ? buildWhatsappRestaurantBotUrl(restaurantId, "/send-message")
    : `${baseUrl}${getWhatsappBotSendPath()}`;

  if (!sendUrl) {
    return {
      ok: false,
      skipped: false,
      error: "Restaurante inválido para envio via WhatsApp.",
    };
  }

  try {
    const response = await fetch(sendUrl, {
      method: "POST",
      headers: buildWhatsappBotHeaders({ "content-type": "application/json" }),
      signal: getWhatsappBotRequestSignal(),
      body: JSON.stringify({
        phone: normalizedPhone,
        number: normalizedPhone,
        to: normalizedPhone,
        message,
        text: message,
        orderId,
        status,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return {
        ok: false,
        skipped: false,
        error: details || `API WhatsApp respondeu HTTP ${response.status}.`,
      };
    }

    return {
      ok: true,
      skipped: false,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Falha desconhecida ao chamar API WhatsApp.",
    };
  }
}
