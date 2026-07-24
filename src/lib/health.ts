import { createAdminClient } from "@/lib/supabase/server";
import {
  buildWhatsappBotHeaders,
  buildWhatsappBotUrl,
  getWhatsappBotRequestSignal,
} from "@/lib/whatsapp-bot";

export type HealthStatus = "healthy" | "degraded" | "unavailable";

export type HealthCheck = {
  status: HealthStatus;
  latencyMs: number;
  connection?: string;
};

function unavailableCheck(startedAt: number): HealthCheck {
  return {
    status: "unavailable",
    latencyMs: Date.now() - startedAt,
  };
}

export async function checkDatabase(): Promise<HealthCheck> {
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

export async function checkWhatsapp(): Promise<HealthCheck> {
  const startedAt = Date.now();
  const statusUrl = buildWhatsappBotUrl("/status");

  if (!statusUrl) return unavailableCheck(startedAt);

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

export async function settleHealthCheck(
  check: () => Promise<HealthCheck>,
): Promise<{ check: HealthCheck; error?: string }> {
  const startedAt = Date.now();

  try {
    return { check: await check() };
  } catch (error) {
    return {
      check: unavailableCheck(startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
