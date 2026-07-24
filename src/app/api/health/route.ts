import { NextResponse } from "next/server";
import { checkDatabase, settleHealthCheck } from "@/lib/health";
import { logOperationalEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id") || crypto.randomUUID();
  const database = await settleHealthCheck(checkDatabase);
  const healthy = database.check.status === "healthy";
  const durationMs = Date.now() - startedAt;

  if (database.error) {
    logOperationalEvent("error", "health_check_dependency_failed", {
      requestId,
      dependency: "database",
      error: database.error,
    });
  }

  logOperationalEvent(healthy ? "info" : "warn", "health_check_completed", {
    requestId,
    healthy,
    durationMs,
    databaseStatus: database.check.status,
  });

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unavailable",
      checkedAt: new Date().toISOString(),
      durationMs,
      checks: {
        database: database.check,
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
