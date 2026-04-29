"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquareQuote, Sparkles, Star, TrendingUp } from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  orders: {
    id: string;
    customer_name: string;
  } | null;
};

const REVIEW_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "positive", label: "4 e 5 estrelas" },
  { id: "neutral", label: "3 estrelas" },
  { id: "critical", label: "1 e 2 estrelas" },
] as const;

function formatDate(date: string) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReviewsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white" />
        <div className="space-y-3">
          <div className="h-6 w-36 rounded-full bg-white" />
          <div className="h-4 w-72 rounded-full bg-white" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="surface-card h-56 rounded-[28px]" />
        <div className="surface-card h-56 rounded-[28px]" />
      </div>
      <div className="mt-6 space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="surface-card h-40 rounded-[28px]" />
        ))}
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<(typeof REVIEW_FILTERS)[number]["id"]>("all");

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReviews = async () => {
    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user) return router.push("/admin/login");
      if (!restaurant) {
        setErrorMsg("Nao foi possivel localizar a loja.");
        return;
      }

      const { data, error } = await (supabase as any)
        .from("reviews")
        .select("id, rating, comment, created_at, orders (id, customer_name)")
        .eq("restaurant_id", restaurant.id)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setReviews((data || []) as Review[]);
    } catch (error) {
      console.error(error);
      setErrorMsg("Erro ao carregar as reviews.");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (reviews.length === 0) {
      return {
        average: 0,
        total: 0,
        breakdown: [0, 0, 0, 0, 0],
        positiveRate: 0,
      };
    }

    const total = reviews.length;
    const average = reviews.reduce((sum, review) => sum + review.rating, 0) / total;
    const positiveCount = reviews.filter((review) => review.rating >= 4).length;
    const breakdown = [0, 0, 0, 0, 0];

    reviews.forEach((review) => {
      if (review.rating >= 1 && review.rating <= 5) {
        breakdown[review.rating - 1] += 1;
      }
    });

    return {
      average,
      total,
      breakdown,
      positiveRate: (positiveCount / total) * 100,
    };
  }, [reviews]);

  const visibleReviews = useMemo(() => {
    if (filter === "all") return reviews;
    if (filter === "positive") return reviews.filter((review) => review.rating >= 4);
    if (filter === "neutral") return reviews.filter((review) => review.rating === 3);
    return reviews.filter((review) => review.rating <= 2);
  }, [filter, reviews]);

  if (loading) {
    return <ReviewsSkeleton />;
  }

  if (errorMsg) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-red-700">
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center gap-4">
        <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm">
          <Star size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950">Avaliacoes</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Leia o sentimento dos clientes e acompanhe a reputacao da operacao.
          </p>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="surface-card overflow-hidden rounded-[28px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Nota media</p>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-6xl font-black text-gray-950">{stats.average.toFixed(1)}</p>
                <div className="mb-2 flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={18}
                      className={star <= Math.round(stats.average) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}
                    />
                  ))}
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-500">{stats.total} avaliacoes recebidas</p>
            </div>
            <div className="rounded-2xl bg-[#fff2ea] p-3 text-[var(--brand)]">
              <Sparkles size={18} />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-[22px] bg-[#fcfaf7] px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Taxa positiva</p>
              <p className="mt-2 text-2xl font-black text-gray-950">{stats.positiveRate.toFixed(0)}%</p>
            </div>
            <div className="rounded-[22px] bg-[#fcfaf7] px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Media por pedido</p>
              <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black text-gray-950">
                <TrendingUp size={18} className="text-emerald-600" />
                {stats.average.toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        <div className="surface-card rounded-[28px] p-6">
          <p className="text-sm font-medium text-gray-500">Distribuicao das notas</p>
          <div className="mt-6 space-y-4">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.breakdown[star - 1];
              const width = stats.total > 0 ? (count / stats.total) * 100 : 0;

              return (
                <div key={star} className="grid grid-cols-[58px_1fr_42px] items-center gap-4 text-sm">
                  <div className="inline-flex items-center gap-2 font-bold text-gray-700">
                    <span>{star}</span>
                    <Star size={14} className="fill-yellow-400 text-yellow-400" />
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#f3ebe4]">
                    <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right text-gray-400">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="surface-card mt-6 rounded-[28px] p-5 md:p-6">
        <div className="flex flex-wrap gap-2">
          {REVIEW_FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                filter === item.id
                  ? "bg-[#171311] text-white"
                  : "border border-[var(--line)] bg-white text-gray-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {visibleReviews.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--line)] bg-white px-6 py-16 text-center text-sm text-gray-500">
              Nenhuma avaliacao encontrada para este filtro.
            </div>
          ) : (
            visibleReviews.map((review) => (
              <div key={review.id} className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white">
                <div className="flex flex-col gap-4 border-b border-[var(--line)] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="rounded-2xl bg-[#fcfaf7] px-4 py-3">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            className={star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="font-bold text-gray-950">{review.orders?.customer_name || "Cliente"}</p>
                      <p className="mt-1 text-xs text-gray-400">{formatDate(review.created_at)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {review.orders?.id ? (
                      <span className="inline-flex rounded-full bg-[#f8f3ec] px-3 py-1 text-xs font-bold text-gray-500">
                        Pedido #{review.orders.id.slice(0, 4)}
                      </span>
                    ) : null}
                    <span className="inline-flex rounded-full bg-[#fff4dc] px-3 py-1 text-xs font-bold text-[#a56b00]">
                      {review.rating} estrela{review.rating > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                <div className="px-6 py-5">
                  {review.comment ? (
                    <div className="flex gap-3 rounded-[20px] bg-[#fcfaf7] px-5 py-4">
                      <MessageSquareQuote className="mt-0.5 flex-shrink-0 text-[var(--brand)]" size={18} />
                      <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">{review.comment}</p>
                    </div>
                  ) : (
                    <p className="rounded-[20px] bg-[#fcfaf7] px-5 py-4 text-sm italic text-gray-400">
                      O cliente deixou apenas a nota, sem comentario.
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
