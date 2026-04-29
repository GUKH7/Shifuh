"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Search, Store, UserRound } from "lucide-react";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  user_id: string | null;
  created_at: string;
  primary_color: string | null;
};

function formatDate(date: string) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PlatformPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);

  useEffect(() => {
    const loadRestaurants = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/admin/login");
          return;
        }

        if (!isPlatformAdminEmail(user.email)) {
          router.replace("/admin");
          return;
        }

        const { data, error } = await supabase
          .from("restaurants")
          .select("id, name, slug, phone, user_id, created_at, primary_color")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setRestaurants((data || []) as RestaurantRow[]);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Nao foi possivel carregar as lojas.");
      } finally {
        setLoading(false);
      }
    };

    loadRestaurants();
  }, [router, supabase]);

  const filteredRestaurants = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return restaurants;

    return restaurants.filter((restaurant) =>
      [restaurant.name, restaurant.slug, restaurant.phone || "", restaurant.user_id || ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, restaurants]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-[var(--brand)]" size={30} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center gap-4">
        <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm">
          <Store size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950">Lojas cadastradas</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Visao administrativa da plataforma com todas as operacoes registradas.
          </p>
        </div>
      </div>

      <section className="surface-card rounded-[28px] p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="text-sm font-medium text-gray-500">Total de lojas</p>
            <p className="mt-3 text-3xl font-black text-gray-950">{restaurants.length}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="text-sm font-medium text-gray-500">Com telefone</p>
            <p className="mt-3 text-3xl font-black text-gray-950">
              {restaurants.filter((restaurant) => Boolean(restaurant.phone)).length}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="text-sm font-medium text-gray-500">Com usuario vinculado</p>
            <p className="mt-3 text-3xl font-black text-gray-950">
              {restaurants.filter((restaurant) => Boolean(restaurant.user_id)).length}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
          <Search size={18} className="text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por loja, slug, telefone ou user_id"
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="mt-6 space-y-3">
          {filteredRestaurants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white py-14 text-center text-sm text-gray-500">
              Nenhuma loja encontrada para este filtro.
            </div>
          ) : (
            filteredRestaurants.map((restaurant) => (
              <div
                key={restaurant.id}
                className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white"
                      style={{ backgroundColor: restaurant.primary_color || "#f97316" }}
                    >
                      {restaurant.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-gray-950">{restaurant.name}</p>
                      <p className="text-sm text-gray-500">/{restaurant.slug}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <UserRound size={14} />
                      {restaurant.user_id || "Sem user_id"}
                    </span>
                    <span>{restaurant.phone || "Sem telefone"}</span>
                    <span>Criada em {formatDate(restaurant.created_at)}</span>
                  </div>
                </div>

                <a
                  href={`/${restaurant.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[#faf5ef] px-4 py-3 text-sm font-bold text-gray-700"
                >
                  Ver vitrine
                  <ExternalLink size={15} />
                </a>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
