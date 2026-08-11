"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { BadgePercent, Calculator, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { useToast } from "@/components/ui/toast-provider";

type DeliveryTier = {
  distance: number;
  time: number;
  price: number;
};

type DeliveryRules = {
  version: 1;
  base_rule: {
    step_km: number;
    price_per_step: number;
    max_distance: number;
    default_time: number;
  };
  free_delivery: {
    enabled: boolean;
    minimum_order: number;
    max_fee: number;
  };
};

const DEFAULT_RULES: DeliveryRules = {
  version: 1,
  base_rule: {
    step_km: 1,
    price_per_step: 2,
    max_distance: 10,
    default_time: 30,
  },
  free_delivery: {
    enabled: false,
    minimum_order: 50,
    max_fee: 5,
  },
};

function positiveNumber(value: unknown, fallback: number, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

function normalizeRules(value: unknown): DeliveryRules {
  const raw = value && typeof value === "object" ? value as Record<string, any> : {};
  const base = raw.base_rule && typeof raw.base_rule === "object" ? raw.base_rule : {};
  const free = raw.free_delivery && typeof raw.free_delivery === "object" ? raw.free_delivery : {};

  return {
    version: 1,
    base_rule: {
      step_km: positiveNumber(base.step_km, 1, 0.1),
      price_per_step: positiveNumber(base.price_per_step, 2),
      max_distance: positiveNumber(base.max_distance, 10, 0.1),
      default_time: positiveNumber(base.default_time, 30),
    },
    free_delivery: {
      enabled: Boolean(free.enabled),
      minimum_order: positiveNumber(free.minimum_order, 50),
      max_fee: positiveNumber(free.max_fee, 5),
    },
  };
}

function normalizeTiers(value: unknown): DeliveryTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tier) => tier && typeof tier === "object" && !tier.mode)
    .map((tier) => ({
      distance: positiveNumber(tier.distance, 0),
      time: positiveNumber(tier.time, 0),
      price: positiveNumber(tier.price, 0),
    }))
    .filter((tier) => tier.distance > 0)
    .sort((a, b) => a.distance - b.distance);
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DeliveryRulesEnhancer() {
  const { showToast } = useToast();
  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
    [],
  );
  const [restaurantId, setRestaurantId] = useState("");
  const [rules, setRules] = useState<DeliveryRules>(DEFAULT_RULES);
  const [existingTiers, setExistingTiers] = useState<DeliveryTier[]>([]);
  const [preserveExisting, setPreserveExisting] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { restaurant, user } = await getCurrentRestaurant(supabase);
        if (!user || !restaurant || cancelled) return;
        setRestaurantId(restaurant.id);

        const { data, error } = await (supabase as any)
          .from("restaurants")
          .select("delivery_tiers, delivery_rules")
          .eq("id", restaurant.id)
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;
        setRules(normalizeRules(data?.delivery_rules));
        setExistingTiers(normalizeTiers(data?.delivery_tiers));
      } catch (error) {
        console.error("Falha ao carregar regras de entrega:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const generatedPreview = useMemo(() => {
    const step = Math.max(0.1, rules.base_rule.step_km);
    const limit = Math.max(step, rules.base_rule.max_distance);
    const count = Math.min(100, Math.ceil(limit / step));
    return Array.from({ length: count }, (_, index) => {
      const distance = Math.min(limit, Number(((index + 1) * step).toFixed(2)));
      return {
        distance,
        time: rules.base_rule.default_time,
        price: Number(((index + 1) * rules.base_rule.price_per_step).toFixed(2)),
      };
    });
  }, [rules.base_rule]);

  const updateBaseRule = (field: keyof DeliveryRules["base_rule"], value: number) => {
    setRules((current) => ({
      ...current,
      base_rule: { ...current.base_rule, [field]: value },
    }));
  };

  const updateFreeRule = (field: keyof DeliveryRules["free_delivery"], value: number | boolean) => {
    setRules((current) => ({
      ...current,
      free_delivery: { ...current.free_delivery, [field]: value },
    }));
  };

  const saveRules = async () => {
    if (!restaurantId) return;
    setSavingRules(true);
    try {
      const { error } = await (supabase as any)
        .from("restaurants")
        .update({ delivery_rules: rules })
        .eq("id", restaurantId);
      if (error) throw error;
      showToast({
        title: "Regras de entrega salvas",
        description: rules.free_delivery.enabled
          ? `Frete grátis será aplicado a partir de ${money(rules.free_delivery.minimum_order)} quando a taxa for de até ${money(rules.free_delivery.max_fee)}.`
          : "A regra padrão ficou salva para gerar novas faixas quando necessário.",
        tone: "success",
      });
    } catch (error) {
      console.error(error);
      showToast({
        title: "Não foi possível salvar as regras",
        description: "Confira se a migration de regras avançadas de entrega já foi aplicada.",
        tone: "error",
      });
    } finally {
      setSavingRules(false);
    }
  };

  const generateTiers = async () => {
    if (!restaurantId) return;
    setGenerating(true);
    try {
      const existingByDistance = new Map(
        existingTiers.map((tier) => [tier.distance.toFixed(2), tier]),
      );
      const nextTiers = generatedPreview.map((generated) => {
        if (!preserveExisting) return generated;
        return existingByDistance.get(generated.distance.toFixed(2)) || generated;
      });

      const { error } = await (supabase as any)
        .from("restaurants")
        .update({ delivery_tiers: nextTiers, delivery_rules: rules })
        .eq("id", restaurantId);
      if (error) throw error;

      showToast({
        title: "Faixas geradas",
        description: preserveExisting
          ? "As faixas que já existiam foram preservadas e as novas seguiram a regra padrão."
          : "As faixas foram recalculadas integralmente pela regra padrão.",
        tone: "success",
      });

      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Não foi possível gerar as faixas",
        description: "Tente novamente depois de salvar a configuração da loja.",
        tone: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-6 flex min-h-24 items-center justify-center rounded-[22px] border border-[var(--line)] bg-[#fcfaf7] text-sm font-bold text-gray-500">
        <Loader2 size={17} className="mr-2 animate-spin" /> Carregando regras de entrega...
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-[24px] border border-orange-100 bg-orange-50/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[var(--brand)]">
              <Calculator size={18} />
              <p className="text-xs font-black uppercase tracking-[0.14em]">Regra padrão</p>
            </div>
            <h3 className="mt-2 text-lg font-black text-gray-950">Gere as faixas automaticamente e edite exceções depois</h3>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Exemplo: R$ 2,00 a cada 1 km gera 1 km = R$ 2,00, 2 km = R$ 4,00 e assim por diante. Depois disso, qualquer faixa pode continuar sendo alterada manualmente abaixo.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-[var(--brand)] shadow-sm">
            <Sparkles size={14} /> Gerador de faixas
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">Cobrar</span>
            <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
              <span className="mr-2 text-sm font-bold text-gray-400">R$</span>
              <input type="number" min="0" step="0.01" value={rules.base_rule.price_per_step} onChange={(event) => updateBaseRule("price_per_step", positiveNumber(event.target.value, 0))} className="w-full py-2.5 text-sm outline-none" />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">A cada</span>
            <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
              <input type="number" min="0.1" step="0.1" value={rules.base_rule.step_km} onChange={(event) => updateBaseRule("step_km", positiveNumber(event.target.value, 1, 0.1))} className="w-full py-2.5 text-sm outline-none" />
              <span className="text-sm font-bold text-gray-400">km</span>
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">Até</span>
            <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
              <input type="number" min="0.1" step="0.1" value={rules.base_rule.max_distance} onChange={(event) => updateBaseRule("max_distance", positiveNumber(event.target.value, 10, 0.1))} className="w-full py-2.5 text-sm outline-none" />
              <span className="text-sm font-bold text-gray-400">km</span>
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">Prazo padrão</span>
            <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
              <input type="number" min="0" step="1" value={rules.base_rule.default_time} onChange={(event) => updateBaseRule("default_time", positiveNumber(event.target.value, 30))} className="w-full py-2.5 text-sm outline-none" />
              <span className="text-sm font-bold text-gray-400">min</span>
            </div>
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/80 bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600">
            <input type="checkbox" checked={preserveExisting} onChange={(event) => setPreserveExisting(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span><strong className="text-gray-900">Manter faixas já editadas.</strong> Só distâncias novas recebem o valor automático.</span>
          </label>
          <button type="button" onClick={generateTiers} disabled={generating} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 text-sm font-black text-[var(--brand)] transition hover:bg-orange-50 disabled:opacity-50">
            {generating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {generating ? "Gerando..." : `Gerar ${generatedPreview.length} faixas`}
          </button>
        </div>
      </div>

      <div className="rounded-[24px] border border-[var(--line)] bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><BadgePercent size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-black text-gray-950">Regra de frete grátis por valor do pedido</h3>
                <p className="mt-1 text-sm leading-6 text-gray-500">Crie uma condição como: pedidos a partir de R$ 50,00 deixam grátis taxas de entrega de até R$ 5,00.</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-black text-gray-700">
                <input type="checkbox" checked={rules.free_delivery.enabled} onChange={(event) => updateFreeRule("enabled", event.target.checked)} className="h-5 w-5 accent-[var(--brand)]" />
                Ativar regra
              </label>
            </div>

            <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${rules.free_delivery.enabled ? "" : "opacity-55"}`}>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">Pedido a partir de</span>
                <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                  <span className="mr-2 text-sm font-bold text-gray-400">R$</span>
                  <input disabled={!rules.free_delivery.enabled} type="number" min="0" step="0.01" value={rules.free_delivery.minimum_order} onChange={(event) => updateFreeRule("minimum_order", positiveNumber(event.target.value, 0))} className="w-full py-2.5 text-sm outline-none disabled:bg-transparent" />
                </div>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">Tornar grátis taxas de até</span>
                <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                  <span className="mr-2 text-sm font-bold text-gray-400">R$</span>
                  <input disabled={!rules.free_delivery.enabled} type="number" min="0" step="0.01" value={rules.free_delivery.max_fee} onChange={(event) => updateFreeRule("max_fee", positiveNumber(event.target.value, 0))} className="w-full py-2.5 text-sm outline-none disabled:bg-transparent" />
                </div>
              </label>
            </div>

            {rules.free_delivery.enabled && (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
                Exemplo ativo: acima de {money(rules.free_delivery.minimum_order)}, uma taxa de {money(rules.free_delivery.max_fee)} ou menos passa a custar R$ 0,00. Taxas maiores continuam com o preço normal.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={saveRules} disabled={savingRules} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-black text-white disabled:opacity-50">
                {savingRules ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar regras
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
