"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  BadgePercent,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  MessageSquareQuote,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import {
  AdminButton,
  AdminInput,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
  SortableTableHeader,
  type SortDirection,
} from "@/components/ui/admin-primitives";
import { AdminEmptyState, AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";

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

type ReviewFilter = "all" | "positive" | "neutral" | "critical";
type ReviewSortKey = "customer_name" | "order_id" | "rating" | "created_at" | "comment";

const PAGE_SIZE = 12;

const REVIEW_FILTERS: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "Todas as notas" },
  { value: "positive", label: "4 e 5 estrelas" },
  { value: "neutral", label: "3 estrelas" },
  { value: "critical", label: "1 e 2 estrelas" },
];

const SORT_OPTIONS: Array<{ value: ReviewSortKey; label: string }> = [
  { value: "created_at", label: "Data" },
  { value: "rating", label: "Nota" },
  { value: "customer_name", label: "Cliente" },
  { value: "order_id", label: "Pedido" },
  { value: "comment", label: "Comentário" },
];

function formatDate(date: string) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCustomerName(review: Review) {
  return review.orders?.customer_name || "Cliente";
}

function getOrderNumber(review: Review) {
  return review.orders?.id ? `#${review.orders.id.slice(0, 4)}` : "Sem pedido";
}

function getSortValue(review: Review, key: ReviewSortKey) {
  if (key === "customer_name") return getCustomerName(review).toLocaleLowerCase("pt-BR");
  if (key === "order_id") return review.orders?.id || "";
  if (key === "rating") return Number(review.rating || 0);
  if (key === "created_at") return new Date(review.created_at).getTime();
  return (review.comment || "").toLocaleLowerCase("pt-BR");
}

function matchesRatingFilter(review: Review, filter: ReviewFilter) {
  if (filter === "all") return true;
  if (filter === "positive") return review.rating >= 4;
  if (filter === "neutral") return review.rating === 3;
  return review.rating <= 2;
}

function ReviewsWorkspaceSkeleton() {
  return <AdminPageSkeleton ariaLabel="Carregando avaliações" metrics={2} />;
}

export default function ReviewsWorkspace() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [sortKey, setSortKey] = useState<ReviewSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const { restaurant, user } = await getCurrentRestaurant(supabase);
        if (!user) {
          router.push("/admin/login");
          return;
        }
        if (!restaurant) {
          setErrorMsg("Não foi possível localizar a loja.");
          return;
        }

        const { data, error } = await (supabase as any)
          .from("reviews")
          .select("id, rating, comment, created_at, orders (id, customer_name)")
          .eq("restaurant_id", restaurant.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setReviews((data || []) as Review[]);
      } catch (error) {
        console.error(error);
        setErrorMsg("Erro ao carregar as avaliações.");
      } finally {
        setLoading(false);
      }
    };

    void fetchReviews();
  }, [router, supabase]);

  const stats = useMemo(() => {
    if (!reviews.length) {
      return { average: 0, total: 0, breakdown: [0, 0, 0, 0, 0], positiveRate: 0 };
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

    return { average, total, breakdown, positiveRate: (positiveCount / total) * 100 };
  }, [reviews]);

  const visibleReviews = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    const direction = sortDirection === "asc" ? 1 : -1;

    return reviews
      .filter((review) => {
        const searchText = [
          getCustomerName(review),
          review.orders?.id || "",
          review.comment || "",
          String(review.rating),
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        return matchesRatingFilter(review, filter) && (!term || searchText.includes(term));
      })
      .sort((left, right) => {
        const leftValue = getSortValue(left, sortKey);
        const rightValue = getSortValue(right, sortKey);

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return (leftValue - rightValue) * direction;
        }

        return (
          String(leftValue).localeCompare(String(rightValue), "pt-BR", {
            numeric: true,
            sensitivity: "base",
          }) * direction
        );
      });
  }, [filter, query, reviews, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(visibleReviews.length / PAGE_SIZE));
  const paginatedReviews = visibleReviews.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [filter, query, sortDirection, sortKey]);

  const toggleSort = (key: ReviewSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "customer_name" || key === "order_id" || key === "comment" ? "asc" : "desc");
  };

  if (loading) return <ReviewsWorkspaceSkeleton />;

  if (errorMsg) return <AdminErrorState description={errorMsg} />;

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Avaliações"
        description="Leia o sentimento dos clientes e acompanhe a reputação da operação."
        icon={<Star size={24} />}
      />

      <section className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="surface-card overflow-hidden rounded-[28px] border-orange-100 bg-[linear-gradient(145deg,#ffffff_0%,#fff6ef_100%)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Nota média</p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <p className="text-5xl font-black text-gray-950 sm:text-6xl">{stats.average.toFixed(1)}</p>
                <RatingStars rating={Math.round(stats.average)} />
              </div>
              <p className="mt-3 text-sm text-gray-500">{stats.total} avaliações recebidas</p>
            </div>
            <div className="rounded-2xl bg-[#fff2ea] p-3 text-[var(--brand)]">
              <Sparkles size={18} />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Taxa positiva"
              value={`${stats.positiveRate.toFixed(0)}%`}
              icon={<BadgePercent size={18} />}
              featured
            />
            <MetricCard
              label="Média por pedido"
              value={stats.average.toFixed(1)}
              icon={<TrendingUp size={18} className="text-emerald-600" />}
            />
          </div>
        </div>

        <div className="surface-card rounded-[28px] p-5 sm:p-6">
          <p className="text-sm font-medium text-gray-500">Distribuição das notas</p>
          <div className="mt-6 space-y-4">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.breakdown[star - 1];
              const width = stats.total ? (count / stats.total) * 100 : 0;

              return (
                <div key={star} className="grid grid-cols-[58px_minmax(0,1fr)_42px] items-center gap-3 text-sm sm:gap-4">
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

      <section className="surface-card rounded-[28px] p-4 sm:p-5 md:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative min-w-0">
            <span className="sr-only">Buscar avaliações</span>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <AdminInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente, pedido ou comentário"
              className="pl-11"
            />
          </label>
          <AdminButton variant="filter" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen}>
            <Filter size={16} /> Filtros
            <ChevronDown size={16} className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </AdminButton>
        </div>

        {filtersOpen && (
          <div className="admin-filter-panel mt-3 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
            <AdminSelect className="admin-filter-control" value={filter} onChange={(event) => setFilter(event.target.value as ReviewFilter)}>
              {REVIEW_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </AdminSelect>
            <AdminSelect value={sortKey} onChange={(event) => setSortKey(event.target.value as ReviewSortKey)} className="admin-filter-control xl:hidden">
              {SORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>Ordenar por {item.label}</option>
              ))}
            </AdminSelect>
            <AdminButton
              variant="filter"
              className="xl:hidden"
              onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
            >
              {sortDirection === "asc" ? "Crescente" : "Decrescente"}
            </AdminButton>
            <AdminButton
              variant="filter"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Limpar filtros
            </AdminButton>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-gray-500">
          <span>{visibleReviews.length} {visibleReviews.length === 1 ? "avaliação encontrada" : "avaliações encontradas"}</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-[24px] border border-[var(--line)] bg-white">
          <div className="admin-table-header hidden grid-cols-[minmax(180px,1fr)_110px_130px_155px_minmax(260px,1.5fr)] items-center gap-4 border-b border-[var(--line)] bg-[#fffdfa] px-5 py-4 xl:grid">
            <SortableTableHeader label="Cliente" active={sortKey === "customer_name"} direction={sortKey === "customer_name" ? sortDirection : null} onClick={() => toggleSort("customer_name")} />
            <SortableTableHeader label="Pedido" active={sortKey === "order_id"} direction={sortKey === "order_id" ? sortDirection : null} onClick={() => toggleSort("order_id")} />
            <SortableTableHeader label="Nota" active={sortKey === "rating"} direction={sortKey === "rating" ? sortDirection : null} onClick={() => toggleSort("rating")} />
            <SortableTableHeader label="Data" active={sortKey === "created_at"} direction={sortKey === "created_at" ? sortDirection : null} onClick={() => toggleSort("created_at")} />
            <SortableTableHeader label="Comentário" active={sortKey === "comment"} direction={sortKey === "comment" ? sortDirection : null} onClick={() => toggleSort("comment")} />
          </div>

          {paginatedReviews.length === 0 ? (
            <AdminEmptyState title="Nenhuma avaliação encontrada" description="Revise a busca e os filtros selecionados." />
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {paginatedReviews.map((review) => (
                <article key={review.id}>
                  <div className="hidden grid-cols-[minmax(180px,1fr)_110px_130px_155px_minmax(260px,1.5fr)] items-start gap-4 px-5 py-5 text-sm xl:grid">
                    <div className="min-w-0"><p className="truncate font-bold text-gray-950">{getCustomerName(review)}</p></div>
                    <span className="inline-flex w-fit rounded-full bg-[#f8f3ec] px-3 py-1 text-xs font-bold text-gray-500">{getOrderNumber(review)}</span>
                    <div><RatingStars rating={review.rating} compact /><p className="mt-1 text-xs font-bold text-[#a56b00]">{review.rating} estrela{review.rating > 1 ? "s" : ""}</p></div>
                    <span className="text-sm text-gray-500">{formatDate(review.created_at)}</span>
                    <ReviewComment comment={review.comment} />
                  </div>

                  <div className="p-4 xl:hidden">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-950">{getCustomerName(review)}</p>
                        <p className="mt-1 text-xs text-gray-400">{formatDate(review.created_at)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-[#f8f3ec] px-3 py-1 text-xs font-bold text-gray-500">{getOrderNumber(review)}</span>
                        <span className="inline-flex rounded-full bg-[#fff4dc] px-3 py-1 text-xs font-bold text-[#a56b00]">{review.rating} estrela{review.rating > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="mt-3"><RatingStars rating={review.rating} compact /></div>
                    <div className="mt-4"><ReviewComment comment={review.comment} card /></div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {visibleReviews.length > PAGE_SIZE && (
            <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p>Página {page} de {totalPages}</p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <AdminButton variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft size={16} />Anterior</AdminButton>
                <AdminButton variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Próxima<ChevronRight size={16} /></AdminButton>
              </div>
            </div>
          )}
        </div>
      </section>
    </AdminPageShell>
  );
}

function RatingStars({ rating, compact = false }: { rating: number; compact?: boolean }) {
  return (
    <div className={`flex gap-1 ${compact ? "" : "mb-2"}`} aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={compact ? 15 : 18}
          className={star <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}
        />
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  featured = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <div className={`rounded-[22px] px-4 py-4 ${featured ? "brand-gradient text-white shadow-[0_12px_26px_rgba(255,90,31,0.2)]" : "border border-orange-100 bg-[linear-gradient(145deg,#fff_0%,#fff8f3_100%)]"}`}>
      <p className={`text-xs font-bold uppercase tracking-[0.14em] ${featured ? "text-orange-100" : "text-gray-400"}`}>{label}</p>
      <p className={`mt-2 inline-flex items-center gap-2 text-2xl font-black ${featured ? "text-white" : "text-gray-950"}`}>{icon}{value}</p>
    </div>
  );
}

function ReviewComment({ comment, card = false }: { comment: string | null; card?: boolean }) {
  if (!comment) {
    return <p className={`${card ? "rounded-[20px] bg-[#fcfaf7] px-4 py-4" : ""} text-sm italic text-gray-400`}>O cliente deixou apenas a nota, sem comentário.</p>;
  }

  if (!card) return <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{comment}</p>;

  return (
    <div className="flex gap-3 rounded-[20px] bg-[#fcfaf7] px-4 py-4">
      <MessageSquareQuote className="mt-0.5 shrink-0 text-[var(--brand)]" size={18} />
      <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">{comment}</p>
    </div>
  );
}
