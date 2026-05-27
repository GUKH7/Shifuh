import { NextResponse } from "next/server";
import { buildWhatsappBotUrl } from "@/lib/whatsapp-bot";

export async function GET() {
  const statusUrl = buildWhatsappBotUrl("/status");

  if (!statusUrl) {
    return NextResponse.json(
      { error: "WHATSAPP_BOT_API_URL não configurada." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(statusUrl, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error || "API WhatsApp indisponível." },
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
