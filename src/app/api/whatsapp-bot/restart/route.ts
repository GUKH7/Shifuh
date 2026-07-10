import { NextResponse } from "next/server";
import { requireWhatsappBotAccess } from "@/lib/whatsapp-bot-access";
import {
  buildWhatsappBotHeaders,
  buildWhatsappBotUrl,
  getWhatsappBotRequestSignal,
} from "@/lib/whatsapp-bot";

export async function POST() {
  const access = await requireWhatsappBotAccess();

  if (access.response) {
    return access.response;
  }

  const restartUrl = buildWhatsappBotUrl("/restart");

  if (!restartUrl) {
    return NextResponse.json(
      { error: "WHATSAPP_BOT_API_URL nao configurada." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(restartUrl, {
      method: "POST",
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
      const upstreamError =
        typeof payload.error === "string"
          ? payload.error
          : typeof payload.message === "string" && payload.message.trim()
            ? payload.message
            : `API WhatsApp respondeu HTTP ${response.status}.`;
      const error = upstreamError.trimStart().startsWith("<!DOCTYPE")
        ? `API WhatsApp recusou o reinicio (HTTP ${response.status}).`
        : upstreamError;

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
            : "Falha ao reiniciar API WhatsApp.",
      },
      { status: 502 },
    );
  }
}
