"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, CreditCard, ExternalLink, ListChecks, RefreshCcw, ShoppingBag, Store, Truck, ChevronRight } from "lucide-react";
import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";
import { AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { evaluateOnboardingReadiness, type OnboardingReadiness } from "./readiness";
import { getNextSetupStep, shouldRefreshSetupOnFocus } from "./navigation";

const ICONS = [Store, Truck, ShoppingBag, CreditCard];

export default function OnboardingWorkspace() {
  const router = useRouter();
  const [readiness, setReadiness] = useState<OnboardingReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeName, setStoreName] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("A conexão com Supabase não está configurada.");
      const client = createBrowserClient(url, key);
      const { restaurant, user, error: contextError } = await getCurrentRestaurant(client);
      if (!user) {
        router.replace("/admin/login");
        return;
      }
      if (contextError) throw new Error("Não foi possível verificar seu vínculo com a loja.");
      if (!restaurant) {
        router.replace("/admin/setup");
        return;
      }
      // Queries respect RLS and the current account's unique restaurant membership.
      const [categories, products] = await Promise.all([
        client.from("categories").select("id,name,is_active").eq("restaurant_id", restaurant.id),
        client.from("products").select("id,name,price,is_active,category_id").eq("restaurant_id", restaurant.id)
      ]);
      if (categories.error || products.error) {
        throw new Error("Não foi possível consultar o cardápio. Tente atualizar.");
      }
      setReadiness(evaluateOnboardingReadiness({
        restaurant, categories: categories.data ?? [], products: products.data ?? []
      }));
      setStoreName(typeof restaurant.name === "string" ? restaurant.name : "sua loja");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível conferir sua loja.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void reload(); }, [reload]);

  // Existing settings forms persist independently. Re-check their saved data
  // when the merchant returns to this tab, without guessing save success.
  useEffect(() => {
    const onFocus = () => { if (shouldRefreshSetupOnFocus(document.visibilityState)) void reload(); };
    const onVisibility = () => { if (shouldRefreshSetupOnFocus(document.visibilityState)) void reload(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  if (loading) return <AdminPageSkeleton ariaLabel="Conferindo a configuração da loja" metrics={4} />;
  if (error) return <AdminErrorState title="Não foi possível conferir sua loja" description={error} onRetry={() => void reload()} />;
  if (!readiness) return null;

  const nextStep = getNextSetupStep(readiness);

  return (
    <AdminPageShell className="space-y-6 pb-32 sm:pb-24">
      <AdminPageHeader
        title="Preparar minha loja"
        description="Veja o que está pronto e avance pelas configurações já existentes."
        icon={<ListChecks size={23} />}
        action={
          <button type="button" onClick={() => void reload()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-700 sm:w-auto">
            <RefreshCcw size={16} /> Atualizar checklist
          </button>
        }
      />
      <section className="surface-card rounded-[28px] p-5 sm:p-7" aria-labelledby="onboarding-progress-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Primeiros passos</p>
            <h2 id="onboarding-progress-title" className="mt-2 text-xl font-black text-gray-950 sm:text-2xl">
              {readiness.readyForReview ? "Configuração básica pronta para revisão" : "Vamos preparar " + storeName}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              O progresso é calculado a partir dos dados salvos, não de cliques nos cartões.
            </p>
          </div>
          <div className="rounded-2xl bg-orange-50 px-4 py-3 text-center">
            <p className="text-2xl font-black tabular-nums text-[var(--brand)]">
              {readiness.completeCount}/{readiness.totalCount}
            </p>
            <p className="text-xs font-bold text-gray-600">configurações prontas</p>
          </div>
        </div>
        <div role="progressbar" aria-label="Progresso de configuração" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={readiness.percent} className="mt-5 h-2 overflow-hidden rounded-full bg-orange-100">
          <div className="h-full rounded-full bg-[var(--brand)] transition-[width]"
            style={{ width: readiness.percent + "%" }} />
        </div>
      </section>
      {nextStep ? (
        <section aria-label="Próximo passo recomendado" className="surface-card rounded-[24px] p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Continue de onde parou</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-black text-gray-950">{nextStep.title}</h2>
              <p className="mt-1 text-sm text-gray-600">{nextStep.issues[0]}</p>
            </div>
            <Link href={nextStep.href}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white">
              Abrir configuração <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      ) : null}
      <section aria-label="Checklist de preparação" className="grid gap-3 lg:grid-cols-2">
        {readiness.steps.map((step,index) => {
          const Icon = ICONS[index];
          const complete = step.status === "complete";
          return (
            <article key={step.id} className="surface-card flex min-w-0 flex-col rounded-[24px] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Icon size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black text-gray-950">{index + 1}. {step.title}</h3>
                    <span className={
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold " +
                      (complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")
                    }>
                      {complete ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {complete ? "Pronto" : "Pendente"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{step.description}</p>
                </div>
              </div>
              {step.issues.length ? (
                <ul className="mt-4 space-y-1 rounded-2xl bg-[#fff8ef] px-4 py-3 text-sm leading-6 text-amber-900">
                  {step.issues.map(issue => <li key={issue}>• {issue}</li>)}
                </ul>
              ) : null}
              <Link href={step.href}
                className="mt-auto inline-flex min-h-11 items-center justify-between gap-3 pt-4 text-sm font-bold text-[var(--brand)]">
                {complete ? "Revisar configuração" : "Configurar agora"} <ChevronRight size={17} />
              </Link>
            </article>
          );
        })}
      </section>
      <section className="surface-card rounded-[28px] p-5 sm:p-7" aria-label="Revisão da vitrine">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
            <ClipboardCheck size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-gray-950">5. Revisar a vitrine</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              {readiness.readyForReview
                ? "Confira o cardápio como cliente antes de divulgar o link."
                : "Conclua os itens pendentes acima. Você ainda pode conferir a vitrine atual."}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-sm leading-6 text-gray-700">
          <strong>Atenção:</strong> esta página não publica nem despublica a loja. O link já pode ser público.
          Não finalize pedidos reais apenas para testar.
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {readiness.publicSlug ? (
            <Link href={"/" + encodeURIComponent(readiness.publicSlug)} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white">
              Abrir vitrine <ExternalLink size={16} />
            </Link>
          ) : null}
          <Link href="/admin" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] px-5 py-3 text-sm font-bold text-gray-700">
            Ir ao painel <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      {nextStep ? (
        <nav aria-label="Próxima configuração" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:hidden">
          <Link href={nextStep.href} className="mx-auto flex min-h-12 max-w-lg items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 text-sm font-bold text-white">
            Continuar: {nextStep.title} <ChevronRight size={17} />
          </Link>
        </nav>
      ) : null}
      <p className="px-1 text-xs leading-5 text-gray-500">
        Este checklist é somente de leitura: não cria pedidos, altera produtos, confirma pagamentos ou ativa integrações.
        Dados válidos não comprovam revisão manual de configurações padrão.
      </p>
    </AdminPageShell>
  );
}
