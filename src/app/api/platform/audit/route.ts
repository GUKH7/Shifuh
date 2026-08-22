import { NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/platform-admin";

export async function GET(request: Request) {
  const guard = await requirePlatformPermission("audit.read");
  if (!guard.ok) return guard.response;

  const rawLimit = Number(new URL(request.url).searchParams.get("limit") || 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 100;

  const { data, error } = await guard.admin
    .from("platform_audit_log")
    .select("id, actor_user_id, actor_role, action, target_type, target_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Erro ao carregar auditoria da plataforma:", error);
    return NextResponse.json({ error: "Erro ao carregar auditoria." }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
