import { NextResponse } from "next/server";
import { checkWhatsapp, settleHealthCheck } from "@/lib/health";
import { logOperationalEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id") || crypto.randomUUID();
  const whatsapp = await settleHealthCheck(checkWhatsapp);
  const healthy = whatsapp.check.status === "healthy";

  if (whatsapp.error) {
    logOperationalEvent("error", "health_check_dependency_failed", {
      requestId,
      dependency: "whatsapp",
      error: whatsapp.error,
    });
  }

  logOperationalEvent(healthy ? "info" : "warn", "integration_health_check_completed", {
    requestId,
    healthy,
    durationMs: Date.now() - startedAt,
    whatsappStatus: whatsapp.check.status,
    whatsappConnection: whatsapp.check.connection,
  });

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      checks: {
        whatsapp: whatsapp.check,
      },
    },
    {
      status: 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
