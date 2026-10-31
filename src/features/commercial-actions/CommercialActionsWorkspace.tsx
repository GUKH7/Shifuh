"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { ArrowRight, Lightbulb, RefreshCw } from "lucide-react";
import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";
import { AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { getCommercialActions, type CommercialAction, type CommercialInput } from "./rules";
import { getSalesInsights, type SalesInsights, type SalesOrder } from "./sales-insights";

export default function CommercialActionsWorkspace() {
  const router = useRouter();
  const [actions, setActions] = useState<CommercialAction[]>([]);
  const [insights, setInsights] = useState<SalesInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Conexão com o Supabase não configurada.");
      const client = createBrowserClient(url, key);
      const { restaurant, user, error: contextError } = await getCurrentRestaurant(client);
      if (!user) { router.replace("/admin/login"); return; }
      if (contextError) throw new Error("Não foi possível validar o acesso à loja.");
      if (!restaurant) { router.replace("/admin/setup"); return; }
      const [categories, products] = await Promise.all([
        client.from("categories").select("id,name,is_active").eq("restaurant_id", restaurant.id),
        client.from("products").select("id,name,is_active,category_id,price").eq("restaurant_id", restaurant.id),
      ]);
      if (categories.error || products.error) throw new Error("Não foi possível consultar o cardápio.");
      const input: CommercialInput = {
        restaurant,
        categories: categories.data ?? [],
        products: products.data ?? [],
      };
      // Paginate to avoid silently presenting partial metrics when the PostgREST row cap is reached.
      // No customer identity, phone or address is fetched, stored or displayed.
      const now = Date.now();
      const cutoff = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
      const pageSize = 1000;
      const maxOrders = 5000;
      let orders: SalesOrder[] = [];
      let expectedCount: number | null = null;
      for (let offset = 0; offset < maxOrders; offset += pageSize) {
        const page = await client.from("orders")
          .select("id,created_at,status,total", {count:"exact"})
          .eq("restaurant_id", restaurant.id)
          .gte("created_at", cutoff)
          .lte("created_at", new Date(now).toISOString())
          .order("created_at", {ascending:false})
          .order("id", {ascending:false})
          .range(offset, offset + pageSize - 1);
        if (page.error) throw new Error("Não foi possível consultar os pedidos recentes.");
        if (expectedCount === null) expectedCount = page.count;
        const rows = (page.data ?? []) as SalesOrder[];
        orders = orders.concat(rows);
        if (rows.length < pageSize || (expectedCount !== null && orders.length >= expectedCount)) break;
      }
      setActions(getCommercialActions(input));
      setInsights(getSalesInsights(orders, now, expectedCount !== null && orders.length >= expectedCount));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar oportunidades.");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void reload(); }, [reload]);
  if (loading) return <AdminPageSkeleton ariaLabel="Carregando oportunidades comerciais" metrics={3} />;
  if (error) return <AdminErrorState title="Não foi possível carregar as oportunidades" description={error} onRetry={() => void reload()} />;

  const allActions = [...(insights?.actions ?? []), ...actions];
  const urgent = allActions.filter(action => action.priority !== "suggestion")
    .sort((a, b) => (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1));
  const suggestions = allActions.filter(action => action.priority === "suggestion");
  const formatMoney = (value: number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(value);

  return (
    <AdminPageShell className="space-y-6 pb-24">
      <AdminPageHeader title="Ações comerciais" description="Oportunidades práticas para revisar sua loja e planejar vendas, sem alterações automáticas." icon={<Lightbulb size={22}/>}
        action={<button type="button" onClick={() => void reload()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] px-4 text-sm font-bold sm:w-auto"><RefreshCw size={16}/> Atualizar</button>}/>
      <section aria-labelledby="commercial-sales-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="commercial-sales-title" className="text-lg font-black text-gray-950">Panorama de vendas</h2>
          <span className="text-xs font-medium text-gray-500">Últimos 30 dias · janela móvel</span>
        </div>
        {insights?.coverage === "complete" && insights.current ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ["Pedidos concluídos", String(insights.current.completed)],
              ["Faturamento concluído", formatMoney(insights.current.revenue)],
              ["Ticket médio", insights.current.completed ? formatMoney(insights.current.averageTicket) : "—"],
              ["Cancelados", insights.current.canceled + " (" + insights.current.canceledPercent + "%)"],
            ].map(([label, value]) => (
              <div key={label} className="surface-card min-w-0 rounded-[22px] p-4 sm:p-5">
                <p className="text-xs font-bold text-gray-500">{label}</p>
                <p className="mt-2 break-words text-xl font-black tabular-nums text-gray-950 sm:text-2xl">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p role="status" className="surface-card rounded-2xl p-4 text-sm text-amber-800">
            Há pedidos demais ou informações incompletas para produzir um panorama confiável. Consulte o histórico antes de decidir.
          </p>
        )}
        <p className="text-xs leading-5 text-gray-500">
          Somente pedidos concluídos entram no faturamento e no ticket médio. Cancelamentos são calculados sobre pedidos concluídos e cancelados. Comparação com os 30 dias anteriores; não são previsões.
        </p>
      </section>
      <section aria-labelledby="commercial-priority-title" className="space-y-3">
        <h2 id="commercial-priority-title" className="text-lg font-black text-gray-950">Pontos de atenção</h2>
        {urgent.length === 0 ? <div className="surface-card rounded-[24px] p-5 text-sm text-gray-600" role="status">Nenhuma pendência identificada com os dados consultados. Confira as ideias abaixo para continuar evoluindo suas vendas.</div> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {urgent.map(action => <ActionCard key={action.id} action={action}/>)}
        </div>
      </section>
      <section aria-labelledby="commercial-ideas-title" className="space-y-3">
        <h2 id="commercial-ideas-title" className="text-lg font-black text-gray-950">Ideias para vender mais</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {suggestions.map(action => <ActionCard key={action.id} action={action}/>)}
        </div>
      </section>
      <p className="text-xs leading-5 text-gray-500">As recomendações são orientativas e usam somente dados disponíveis da sua loja. Não comprovam vendas futuras nem ativam campanhas, cupons ou mensagens.</p>
    </AdminPageShell>
  );
}

function ActionCard({action}: {action: CommercialAction}) {
  return (
    <article className="surface-card flex min-w-0 flex-col gap-3 rounded-[24px] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-base font-black text-gray-950">{action.title}</h3>
        {action.priority === "high" ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Prioritário</span> : null}
      </div>
      <p className="flex-1 text-sm leading-6 text-gray-600">{action.description}</p>
      <Link href={action.href} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 text-sm font-bold text-white sm:w-fit">
        {action.cta} <ArrowRight size={16}/>
      </Link>
    </article>
  );
}
