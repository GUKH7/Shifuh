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
        phone,
        number: phone,
        to: phone,
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
