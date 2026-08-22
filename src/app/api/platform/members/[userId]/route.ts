import { NextResponse } from "next/server";
import {
  isPlatformRole,
  requirePlatformPermission,
  writePlatformAuditLog,
} from "@/lib/platform-admin";
import { readJsonObject, validationErrorResponse } from "@/lib/api/validation";

type Params = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const guard = await requirePlatformPermission("members.manage");
    if (!guard.ok) return guard.response;

    const { userId } = await context.params;
    if (!userId?.trim()) return NextResponse.json({ error: "Membro inválido." }, { status: 400 });

    const body = await readJsonObject(request);
    const requestedRole = typeof body.role === "string" ? body.role : undefined;
    const requestedActive = typeof body.is_active === "boolean" ? body.is_active : undefined;

    if (requestedRole === undefined && requestedActive === undefined) {
      return NextResponse.json({ error: "Nenhuma alteração foi informada." }, { status: 400 });
    }
    if (requestedRole !== undefined && !isPlatformRole(requestedRole)) {
      return NextResponse.json({ error: "Role da plataforma inválida." }, { status: 400 });
    }

    const { data: current, error: currentError } = await guard.admin
      .from("platform_members")
      .select("user_id, role, is_active, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });

    const nextRole = requestedRole ?? current.role;
    const nextActive = requestedActive ?? current.is_active;
    const removesOwner = current.role === "owner" && current.is_active && (nextRole !== "owner" || !nextActive);

    if (removesOwner) {
      const { count, error: ownerCountError } = await guard.admin
        .from("platform_members")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true);

      if (ownerCountError) throw ownerCountError;
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "A plataforma precisa manter pelo menos um owner ativo." },
          { status: 409 },
        );
      }
    }

    const updatedAt = new Date().toISOString();
    const { error: updateError } = await guard.admin
      .from("platform_members")
      .update({ role: nextRole, is_active: nextActive, updated_at: updatedAt })
      .eq("user_id", userId);

    if (updateError) throw updateError;

    try {
      await writePlatformAuditLog(guard.admin, guard.access, {
        action: "platform_member.update",
        targetType: "platform_member",
        targetId: userId,
        metadata: {
          before: { role: current.role, is_active: current.is_active },
          after: { role: nextRole, is_active: nextActive },
        },
      });
    } catch (auditError) {
      await guard.admin
        .from("platform_members")
        .update({ role: current.role, is_active: current.is_active, updated_at: current.updated_at })
        .eq("user_id", userId);
      throw auditError;
    }

    return NextResponse.json({ ok: true, role: nextRole, is_active: nextActive });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    console.error("Erro ao atualizar membro da plataforma:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar membro." }, { status: 500 });
  }
}
