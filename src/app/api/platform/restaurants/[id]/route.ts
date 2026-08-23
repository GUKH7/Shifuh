import { NextResponse } from "next/server";
import { requirePlatformPermission, writePlatformAuditLog } from "@/lib/platform-admin";
import {
  ApiValidationError,
  optionalString,
  readJsonObject,
  requiredString,
  validationErrorResponse,
} from "@/lib/api/validation";

type Params = {
  params: Promise<{ id: string }>;
};

const RESTAURANT_FIELDS =
  "id, name, slug, phone, user_id, created_at, primary_color, deleted_at, deleted_by";

export async function GET(_: Request, context: Params) {
  const guard = await requirePlatformPermission("restaurants.read");
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  if (!id?.trim()) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });

  const { data, error } = await guard.admin
    .from("restaurants")
    .select(RESTAURANT_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Erro ao carregar loja." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });

  return NextResponse.json({ restaurant: data });
}

export async function PATCH(request: Request, context: Params) {
  try {
    const guard = await requirePlatformPermission("restaurants.update");
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    if (!id?.trim()) {
      throw new ApiValidationError("Loja inválida.", { code: "INVALID_RESTAURANT_ID" });
    }

    const body = await readJsonObject(request);
    const name = requiredString(body, "name", { minLength: 2, maxLength: 120 });
    const slug = requiredString(body, "slug", { minLength: 2, maxLength: 80 }).toLowerCase();
    const phone = optionalString(body, "phone", { maxLength: 24 }) || "";
    const primaryColor = optionalString(body, "primary_color", { maxLength: 16 }) || null;

    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new ApiValidationError("Slug inválido.", {
        code: "INVALID_SLUG",
        issues: [{ field: "slug", message: "Use apenas letras minúsculas, números e hífens." }],
      });
    }

    if (primaryColor && !/^#[0-9a-f]{6}$/i.test(primaryColor)) {
      throw new ApiValidationError("Cor principal inválida.", {
        code: "INVALID_PRIMARY_COLOR",
        issues: [{ field: "primary_color", message: "Use uma cor hexadecimal no formato #RRGGBB." }],
      });
    }

    const { data: current, error: currentError } = await guard.admin
      .from("restaurants")
      .select(RESTAURANT_FIELDS)
      .eq("id", id)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    if (current.deleted_at) {
      return NextResponse.json(
        { error: "Restaure a loja antes de editar seus dados." },
        { status: 409 },
      );
    }

    const { data: conflictingSlug } = await guard.admin
      .from("restaurants")
      .select("id")
      .eq("slug", slug)
      .neq("id", id)
      .maybeSingle();

    if (conflictingSlug) {
      return NextResponse.json(
        { code: "SLUG_ALREADY_IN_USE", error: "Este slug já está em uso." },
        { status: 409 },
      );
    }

    const nextValues = {
      name,
      slug,
      phone,
      primary_color: primaryColor,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await guard.admin
      .from("restaurants")
      .update(nextValues)
      .eq("id", id)
      .is("deleted_at", null);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    try {
      await writePlatformAuditLog(guard.admin, guard.access, {
        action: "restaurant.update",
        targetType: "restaurant",
        targetId: id,
        metadata: {
          before: {
            name: current.name,
            slug: current.slug,
            phone: current.phone,
            primary_color: current.primary_color,
          },
          after: { name, slug, phone, primary_color: primaryColor },
        },
      });
    } catch (auditError) {
      await guard.admin
        .from("restaurants")
        .update({
          name: current.name,
          slug: current.slug,
          phone: current.phone,
          primary_color: current.primary_color,
        })
        .eq("id", id);
      throw auditError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    console.error("Erro ao atualizar loja:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar loja." }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: Params) {
  try {
    const guard = await requirePlatformPermission("restaurants.archive");
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    if (!id?.trim()) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });

    const { data: current, error: currentError } = await guard.admin
      .from("restaurants")
      .select(RESTAURANT_FIELDS)
      .eq("id", id)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    if (current.deleted_at) return NextResponse.json({ ok: true, archived: true });

    const deletedAt = new Date().toISOString();
    const { error: archiveError } = await guard.admin
      .from("restaurants")
      .update({ deleted_at: deletedAt, deleted_by: guard.user.id, updated_at: deletedAt })
      .eq("id", id)
      .is("deleted_at", null);

    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 400 });

    try {
      await writePlatformAuditLog(guard.admin, guard.access, {
        action: "restaurant.archive",
        targetType: "restaurant",
        targetId: id,
        metadata: { name: current.name, slug: current.slug, archived_at: deletedAt },
      });
    } catch (auditError) {
      await guard.admin
        .from("restaurants")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", id);
      throw auditError;
    }

    return NextResponse.json({ ok: true, archived: true });
  } catch (error) {
    console.error("Erro ao arquivar loja:", error);
    return NextResponse.json({ error: "Erro interno ao arquivar loja." }, { status: 500 });
  }
}
