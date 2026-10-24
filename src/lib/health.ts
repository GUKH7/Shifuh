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
  scope?: "service";
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
  // /status describes the retired global WhatsApp session and intentionally
  // returns 410 when per-restaurant sessions are enabled. /health describes
  // the availability of the API itself, independent of tenant connection state.
  const healthUrl = buildWhatsappBotUrl("/health");

  if (!healthUrl) return unavailableCheck(startedAt);

  const response = await fetch(healthUrl, {
    cache: "no-store",
    headers: buildWhatsappBotHeaders({ accept: "application/json" }),
    signal: getWhatsappBotRequestSignal(),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp service health check returned HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !("status" in payload) ||
    payload.status !== "ok" ||
    !("service" in payload) ||
    payload.service !== "shifuh-whatsapp-api"
  ) {
    throw new Error("Unexpected response from WhatsApp service health endpoint.");
  }

  return {
    status: "healthy",
    latencyMs: Date.now() - startedAt,
    scope: "service",
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
