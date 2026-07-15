import { NextResponse } from "next/server";
import { logOperationalEvent } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildWhatsappBotHeaders,
  buildWhatsappBotUrl,
  getWhatsappBotRequestSignal,
} from "@/lib/whatsapp-bot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckStatus = "healthy" | "degraded" | "unavailable";

type HealthCheck = {
  status: CheckStatus;
  latencyMs: number;
  connection?: string;
};

async function checkDatabase(): Promise<HealthCheck> {
  const startedAt = Date.now();
  const admin = createAdminClient();
  const { error } = await admin
    .from("restaurants")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(error.message || "Database health check failed.");
  }

  return {
    status: "healthy",
    latencyMs: Date.now() - startedAt,
  };
}

async function checkWhatsapp(): Promise<HealthCheck> {
  const startedAt = Date.now();
  const statusUrl = buildWhatsappBotUrl("/status");

  if (!statusUrl) {
    return {
      status: "unavailable",
      latencyMs: Date.now() - startedAt,
    };
  }

  const response = await fetch(statusUrl, {
    cache: "no-store",
    headers: buildWhatsappBotHeaders({ accept: "application/json" }),
    signal: getWhatsappBotRequestSignal(),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp health check returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { status?: unknown };
  const connection = typeof payload.status === "string" ? payload.status : "unknown";

  return {
    status: connection === "conectado" ? "healthy" : "degraded",
    latencyMs: Date.now() - startedAt,
    connection,
  };
}

function unavailableCheck(startedAt: number): HealthCheck {
  return {
    status: "unavailable",
    latencyMs: Date.now() - startedAt,
  };
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id") || crypto.randomUUID();

  logOperationalEvent("info", "health_check_started", {
    requestId,
    route: "/api/health",
  });

  const databaseStartedAt = Date.now();
  const whatsappStartedAt = Date.now();
  const [databaseResult, whatsappResult] = await Promise.allSettled([
    checkDatabase(),
    checkWhatsapp(),
  ]);

  const database =
    databaseResult.status === "fulfilled"
      ? databaseResult.value
      : unavailableCheck(databaseStartedAt);
  const whatsapp =
    whatsappResult.status === "fulfilled"
      ? whatsappResult.value
      : unavailableCheck(whatsappStartedAt);
  const healthy = database.status === "healthy" && whatsapp.status === "healthy";
  const durationMs = Date.now() - startedAt;

  if (databaseResult.status === "rejected") {
    logOperationalEvent("error", "health_check_dependency_failed", {
      requestId,
      dependency: "database",
      error:
        databaseResult.reason instanceof Error
          ? databaseResult.reason.message
          : String(databaseResult.reason),
    });
  }

  if (whatsappResult.status === "rejected") {
    logOperationalEvent("error", "health_check_dependency_failed", {
      requestId,
      dependency: "whatsapp",
      error:
        whatsappResult.reason instanceof Error
          ? whatsappResult.reason.message
          : String(whatsappResult.reason),
    });
  }

  logOperationalEvent(healthy ? "info" : "warn", "health_check_completed", {
    requestId,
    healthy,
    durationMs,
    databaseStatus: database.status,
    whatsappStatus: whatsapp.status,
    whatsappConnection: whatsapp.connection,
  });

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checkedAt: new Date().toISOString(),
      durationMs,
      checks: {
        database,
        whatsapp,
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
