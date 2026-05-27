type SendWhatsappMessageInput = {
  phone: string;
  message: string;
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
  return (
    process.env.WHATSAPP_BOT_API_URL ||
    process.env.NEXT_PUBLIC_WHATSAPP_BOT_API_URL ||
    ""
  ).replace(/\/+$/, "");
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

export async function sendWhatsappMessage({
  phone,
  message,
  orderId,
  status,
}: SendWhatsappMessageInput): Promise<SendWhatsappMessageResult> {
  const baseUrl = getWhatsappBotBaseUrl();

  if (!baseUrl) {
    return {
      ok: false,
      skipped: true,
      error: "WHATSAPP_BOT_API_URL ou NEXT_PUBLIC_WHATSAPP_BOT_API_URL não configurada.",
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

  const headers: HeadersInit = {
    "content-type": "application/json",
  };
  const token = process.env.WHATSAPP_BOT_API_TOKEN;

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${baseUrl}${getWhatsappBotSendPath()}`, {
      method: "POST",
      headers,
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
