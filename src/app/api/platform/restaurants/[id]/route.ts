import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
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

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
      user: null,
    };
  }

  if (!isPlatformAdminEmail(user.email)) {
    return {
      response: NextResponse.json({ error: "Acesso negado." }, { status: 403 }),
      user: null,
    };
  }

  return { response: null, user };
}

export async function GET() {
  try {
    const authorization = await requirePlatformAdmin();
    if (authorization.response) return authorization.response;

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("restaurants")
      .select("id, name, slug, phone, user_id, created_at, primary_color")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao listar lojas da plataforma:", error);
      return NextResponse.json({ error: "Não foi possível carregar as lojas." }, { status: 500 });
    }

    return NextResponse.json({ restaurants: data || [] });
  } catch (error) {
    console.error("Erro ao listar lojas da plataforma:", error);
    return NextResponse.json({ error: "Erro interno ao carregar lojas." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const authorization = await requirePlatformAdmin();
    if (authorization.response) return authorization.response;

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

    const adminSupabase = createAdminClient();

    const { data: conflictingSlug } = await adminSupabase
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

    const { error } = await adminSupabase
      .from("restaurants")
      .update({
        name,
        slug,
        phone,
        primary_color: primaryColor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
    const authorization = await requirePlatformAdmin();
    if (authorization.response) return authorization.response;

    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.from("restaurants").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao apagar loja:", error);
    return NextResponse.json({ error: "Erro interno ao apagar loja." }, { status: 500 });
  }
}
