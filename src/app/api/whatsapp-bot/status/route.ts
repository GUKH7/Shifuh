import { NextResponse } from "next/server";
import { requireWhatsappBotAccess } from "@/lib/whatsapp-bot-access";
import {
  buildWhatsappBotHeaders,
  buildWhatsappBotUrl,
  getWhatsappBotRequestSignal,
} from "@/lib/whatsapp-bot";

export async function GET() {
  const access = await requireWhatsappBotAccess();

  if (access.response) {
    return access.response;
  }

  const statusUrl = buildWhatsappBotUrl("/status");

  if (!statusUrl) {
    return NextResponse.json(
      { error: "WHATSAPP_BOT_API_URL nao configurada." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(statusUrl, {
      cache: "no-store",
      headers: buildWhatsappBotHeaders({ accept: "application/json" }),
      signal: getWhatsappBotRequestSignal(),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error || "API WhatsApp indisponivel." },
        { status: response.status },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar API WhatsApp.",
      },
      { status: 502 },
    );
  }
}
