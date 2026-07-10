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
    const payloadText = await response.text();
    let payload: Record<string, unknown> = {};

    try {
      payload = payloadText ? JSON.parse(payloadText) : {};
    } catch {
      payload = { message: payloadText };
    }

    if (!response.ok) {
      const error =
        typeof payload.error === "string"
          ? payload.error
          : typeof payload.message === "string" && payload.message.trim()
            ? payload.message
            : `API WhatsApp respondeu HTTP ${response.status}.`;

      return NextResponse.json(
        { error },
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
