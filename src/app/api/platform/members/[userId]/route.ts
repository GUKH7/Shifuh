import { NextResponse } from "next/server";
import { isPlatformRole, requirePlatformPermission } from "@/lib/platform-admin";
import { readJsonObject, validationErrorResponse } from "@/lib/api/validation";

type Params = {
  params: Promise<{ userId: string }>;
};

type PlatformMemberUpdateResult = {
  status: "updated" | "not_found" | "last_owner";
  role: string | null;
  is_active: boolean | null;
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

    const { data, error } = await (guard.admin as any).rpc("update_platform_member_admin", {
      p_user_id: userId,
      p_role: requestedRole ?? null,
      p_is_active: requestedActive ?? null,
      p_actor_user_id: guard.user.id,
      p_actor_role: guard.access.role,
    });

    if (error) throw error;

    const result = (Array.isArray(data) ? data[0] : data) as PlatformMemberUpdateResult | null;
    if (!result || result.status === "not_found") {
      return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
    }

    if (result.status === "last_owner") {
      return NextResponse.json(
        { error: "A plataforma precisa manter pelo menos um owner ativo." },
        { status: 409 },
      );
    }

    if (result.status !== "updated" || !result.role || typeof result.is_active !== "boolean") {
      throw new Error("Resultado inválido ao atualizar membro da plataforma.");
    }

    return NextResponse.json({ ok: true, role: result.role, is_active: result.is_active });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    console.error("Erro ao atualizar membro da plataforma:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar membro." }, { status: 500 });
  }
}
