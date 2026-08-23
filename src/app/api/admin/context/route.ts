import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await (adminSupabase as any).rpc(
    "get_admin_navigation_context_admin",
    { p_user_id: user.id },
  );

  if (error) {
    console.error("Falha ao carregar contexto administrativo:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o contexto administrativo." },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? { restaurant: null, platformAccess: null }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
