import { NextResponse } from "next/server";
import {
  isPlatformRole,
  requirePlatformPermission,
  writePlatformAuditLog,
} from "@/lib/platform-admin";
import { readJsonObject, requiredString, validationErrorResponse } from "@/lib/api/validation";

export async function GET() {
  const guard = await requirePlatformPermission("members.read");
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.admin
    .from("platform_members")
    .select("user_id, role, is_active, created_by, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao listar membros da plataforma:", error);
    return NextResponse.json({ error: "Erro ao carregar equipe da plataforma." }, { status: 500 });
  }

  const members = await Promise.all(
    (data ?? []).map(async (member) => {
      const { data: userData } = await guard.admin.auth.admin.getUserById(member.user_id);
      return {
        ...member,
        email: userData.user?.email ?? null,
      };
    }),
  );

  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  try {
    const guard = await requirePlatformPermission("members.manage");
    if (!guard.ok) return guard.response;

    const body = await readJsonObject(request);
    const email = requiredString(body, "email", { minLength: 5, maxLength: 254 }).toLowerCase();
    const role = requiredString(body, "role", { minLength: 4, maxLength: 20 });

    if (!isPlatformRole(role)) {
      return NextResponse.json({ error: "Role da plataforma inválida." }, { status: 400 });
    }

    let matchedUser: { id: string; email?: string } | null = null;
    let page = 1;

    while (!matchedUser && page <= 10) {
      const { data: usersData, error: usersError } = await guard.admin.auth.admin.listUsers({
        page,
        perPage: 100,
      });
      if (usersError) throw usersError;

      const user = usersData.users.find((candidate) => candidate.email?.toLowerCase() === email);
      if (user) matchedUser = { id: user.id, email: user.email };
      if (usersData.users.length < 100) break;
      page += 1;
    }

    if (!matchedUser) {
      return NextResponse.json(
        { error: "Nenhum usuário autenticado foi encontrado com esse email." },
        { status: 404 },
      );
    }

    const { data: existing, error: existingError } = await guard.admin
      .from("platform_members")
      .select("user_id")
      .eq("user_id", matchedUser.id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      return NextResponse.json(
        { error: "Este usuário já faz parte da equipe da plataforma." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { error: insertError } = await guard.admin.from("platform_members").insert({
      user_id: matchedUser.id,
      role,
      is_active: true,
      created_by: guard.user.id,
      created_at: now,
      updated_at: now,
    });

    if (insertError) throw insertError;

    try {
      await writePlatformAuditLog(guard.admin, guard.access, {
        action: "platform_member.create",
        targetType: "platform_member",
        targetId: matchedUser.id,
        metadata: { role },
      });
    } catch (auditError) {
      await guard.admin.from("platform_members").delete().eq("user_id", matchedUser.id);
      throw auditError;
    }

    return NextResponse.json({ ok: true, user_id: matchedUser.id, role }, { status: 201 });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    console.error("Erro ao adicionar membro da plataforma:", error);
    return NextResponse.json({ error: "Erro interno ao adicionar membro." }, { status: 500 });
  }
}
