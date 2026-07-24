import { NextResponse } from "next/server";
import { checkDatabase, settleHealthCheck } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  const database = await settleHealthCheck(checkDatabase);
  const healthy = database.check.status === "healthy";

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unavailable",
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
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
