import { NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/platform-admin";

export async function GET(request: Request) {
  const guard = await requirePlatformPermission("restaurants.read");
  if (!guard.ok) return guard.response;

  const status = new URL(request.url).searchParams.get("status") || "active";
  let query = guard.admin
    .from("restaurants")
    .select("id, name, slug, phone, user_id, created_at, primary_color, deleted_at, deleted_by")
    .order("created_at", { ascending: false });

  if (status === "archived") query = query.not("deleted_at", "is", null);
  else if (status !== "all") query = query.is("deleted_at", null);

  const { data, error } = await query;

  if (error) {
    console.error("Erro ao listar lojas da plataforma:", error);
    return NextResponse.json({ error: "Erro ao carregar lojas." }, { status: 500 });
  }

  return NextResponse.json({ restaurants: data ?? [] });
}
