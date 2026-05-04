import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ReviewPayload = {
  orderId?: string;
  restaurantId?: string;
  rating?: number;
  comment?: string;
};

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewPayload;
    const rating = Number(body.rating || 0);

    if (!body.orderId || !body.restaurantId || rating < 1 || rating > 5) {
  return NextResponse.json({ error: "Dados inválidos para a avaliação." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Voce precisa entrar para avaliar." }, { status: 401 });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, restaurant_id, user_id, status")
      .eq("id", body.orderId)
      .eq("restaurant_id", body.restaurantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderError || !order) {
    return NextResponse.json({ error: "Pedido não encontrado para avaliação." }, { status: 404 });
    }

    if (order.status !== "done") {
      return NextResponse.json(
      { error: "O pedido precisa estar concluído para receber avaliação." },
        { status: 400 },
      );
    }

    const { data: existingReview } = await (supabase as any)
      .from("reviews")
      .select("id")
      .eq("order_id", body.orderId)
      .maybeSingle();

    if (existingReview?.id) {
    return NextResponse.json({ error: "Esse pedido já foi avaliado." }, { status: 400 });
    }

    const { error: insertError } = await (supabase as any).from("reviews").insert({
      order_id: body.orderId,
      restaurant_id: body.restaurantId,
      user_id: user.id,
      rating,
      comment: body.comment?.trim() || null,
    });

    if (insertError) {
  return NextResponse.json({ error: insertError.message || "Erro ao enviar avaliação." }, { status: 400 });
    }

    try {
      const { data: ratings } = await (supabase as any)
        .from("reviews")
        .select("rating")
        .eq("restaurant_id", body.restaurantId);

      if (ratings) {
        const ratingCount = ratings.length;
        const average =
          ratingCount > 0
            ? round(ratings.reduce((sum: number, item: { rating: number }) => sum + Number(item.rating || 0), 0) / ratingCount)
            : 0;

        await (supabase as any)
          .from("restaurants")
          .update({
            rating_average: average,
            rating_count: ratingCount,
          })
          .eq("id", body.restaurantId);
      }
    } catch (ratingError) {
      console.error("Falha ao atualizar media da loja:", ratingError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao criar review:", error);
  return NextResponse.json({ error: "Erro interno ao enviar avaliação." }, { status: 500 });
  }
}
