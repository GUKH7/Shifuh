import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function requireWhatsappBotAccess() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const { data: restaurants, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const restaurant = restaurants?.[0] ?? null;

  if (restaurantError || !restaurant) {
    return {
      response: NextResponse.json({ error: "Loja não encontrada." }, { status: 403 }),
    };
  }

  return { response: null, user, restaurant };
}
