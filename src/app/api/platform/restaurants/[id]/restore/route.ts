import { NextResponse } from "next/server";
import { requirePlatformPermission, writePlatformAuditLog } from "@/lib/platform-admin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: Params) {
  try {
    const guard = await requirePlatformPermission("restaurants.restore");
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    if (!id?.trim()) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });

    const { data: current, error: currentError } = await guard.admin
      .from("restaurants")
      .select("id, name, slug, deleted_at, deleted_by")
      .eq("id", id)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    if (!current.deleted_at) return NextResponse.json({ ok: true, restored: true });

    const restoredAt = new Date().toISOString();
    const previousDeletedAt = current.deleted_at;
    const previousDeletedBy = current.deleted_by;

    const { error: restoreError } = await guard.admin
      .from("restaurants")
      .update({ deleted_at: null, deleted_by: null, updated_at: restoredAt })
      .eq("id", id)
      .not("deleted_at", "is", null);

    if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 400 });

    try {
      await writePlatformAuditLog(guard.admin, guard.access, {
        action: "restaurant.restore",
        targetType: "restaurant",
        targetId: id,
        metadata: {
          name: current.name,
          slug: current.slug,
          archived_at: previousDeletedAt,
          restored_at: restoredAt,
        },
      });
    } catch (auditError) {
      await guard.admin
        .from("restaurants")
        .update({ deleted_at: previousDeletedAt, deleted_by: previousDeletedBy })
        .eq("id", id);
      throw auditError;
    }

    return NextResponse.json({ ok: true, restored: true });
  } catch (error) {
    console.error("Erro ao restaurar loja:", error);
    return NextResponse.json({ error: "Erro interno ao restaurar loja." }, { status: 500 });
  }
}
