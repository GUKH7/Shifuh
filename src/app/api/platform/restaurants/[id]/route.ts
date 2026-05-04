import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    if (!isPlatformAdminEmail(user.email)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      phone?: string;
      primary_color?: string;
    };

    const name = body.name?.trim();
    const slug = body.slug?.trim().toLowerCase();
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const primaryColor = body.primary_color?.trim() || null;

    if (!name || !slug) {
      return NextResponse.json({ error: "Nome e slug sao obrigatorios." }, { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: "Slug invalido." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: conflictingSlug } = await adminSupabase
      .from("restaurants")
      .select("id")
      .eq("slug", slug)
      .neq("id", id)
      .maybeSingle();

    if (conflictingSlug) {
      return NextResponse.json({ error: "Este slug ja esta em uso." }, { status: 400 });
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
    console.error("Erro ao atualizar loja:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar loja." }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: Params) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    if (!isPlatformAdminEmail(user.email)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const { id } = await context.params;
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
