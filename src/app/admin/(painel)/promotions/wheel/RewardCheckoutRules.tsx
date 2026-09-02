"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift, Loader2, Save, ShoppingCart } from "lucide-react";
import { AdminButton, AdminInput, AdminPageShell } from "@/components/ui/admin-primitives";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

type CampaignRow = {
  id: string;
  name: string;
};

type PrizeRow = {
  id: string;
  prize_type: "percent" | "fixed" | "free_shipping" | "free_product";
  label: string;
  percentage_value: number | null;
  fixed_amount: number | null;
  minimum_order_amount: number | null;
  reward_validity_minutes: number | null;
};

type EditablePrize = PrizeRow & {
  minimumOrder: string;
};

function prizeDescription(prize: PrizeRow) {
  if (prize.prize_type === "percent") return `${Number(prize.percentage_value || 0).toLocaleString("pt-BR")}% OFF`;
  if (prize.prize_type === "fixed") return `R$ ${Number(prize.fixed_amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} OFF`;
  if (prize.prize_type === "free_shipping") return "Frete grátis";
  return "Produto grátis";
}

function validityDescription(minutes: number | null) {
  if (!minutes) return "Sem expiração definida";
  const days = Math.max(1, Math.round(minutes / 1440));
  return `${days} ${days === 1 ? "dia" : "dias"} de validade`;
}

export default function RewardCheckoutRules() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), []);
  const [restaurantId, setRestaurantId] = useState("");
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [prizes, setPrizes] = useState<EditablePrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user || !restaurant) {
        setCampaign(null);
        setPrizes([]);
        return;
      }
      setRestaurantId(restaurant.id);

      const { data: campaignData, error: campaignError } = await (supabase as any)
        .from("promotion_campaigns")
        .select("id, name")
        .eq("restaurant_id", restaurant.id)
        .eq("kind", "roulette")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (campaignError) throw campaignError;

      const currentCampaign = campaignData as CampaignRow | null;
      setCampaign(currentCampaign);
      if (!currentCampaign) {
        setPrizes([]);
        return;
      }

      const { data: prizeData, error: prizeError } = await (supabase as any)
        .from("promotion_prizes")
        .select("id, prize_type, label, percentage_value, fixed_amount, minimum_order_amount, reward_validity_minutes")
        .eq("restaurant_id", restaurant.id)
        .eq("campaign_id", currentCampaign.id)
        .eq("active", true)
        .neq("prize_type", "no_prize")
        .order("sort_order", { ascending: true });
      if (prizeError) throw prizeError;

      setPrizes(((prizeData || []) as PrizeRow[]).map((prize) => ({
        ...prize,
        minimumOrder: String(Number(prize.minimum_order_amount || 0)),
      })));
    } catch (loadError: any) {
      console.error(loadError);
      setError(loadError?.message || "Não foi possível carregar as regras de uso dos prêmios.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void loadRules(); }, [loadRules]);

  const saveRules = async () => {
    if (!restaurantId || !campaign) return;
    const invalid = prizes.find((prize) => {
      const value = Number(prize.minimumOrder.replace(",", "."));
      return !Number.isFinite(value) || value < 0;
    });
    if (invalid) {
      setNotice("");
      setError(`Revise o pedido mínimo de “${invalid.label}”.`);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { error: saveError } = await (supabase as any).rpc("save_promotion_prize_checkout_rules", {
        p_restaurant_id: restaurantId,
        p_campaign_id: campaign.id,
        p_rules: prizes.map((prize) => ({
          prize_id: prize.id,
          minimum_order_amount: Number(prize.minimumOrder.replace(",", ".")),
        })),
      });
      if (saveError) throw saveError;
      setNotice("Regras de uso no checkout salvas com sucesso.");
      await loadRules();
    } catch (saveError: any) {
      console.error(saveError);
      setError(saveError?.message || "Não foi possível salvar as regras de checkout.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageShell className="-mt-6 pb-12">
      <section className="surface-card rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <ShoppingCart size={18} />
            </span>
            <div>
              <h2 className="text-base font-black text-gray-950 sm:text-lg">Regras de uso no checkout</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                Defina a partir de qual valor cada prêmio pode ser usado. Validade, cliente, uso único e disponibilidade continuam sendo revalidados pelo servidor no momento do pedido.
              </p>
            </div>
          </div>
          <AdminButton onClick={() => void saveRules()} disabled={loading || saving || prizes.length === 0}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar regras
          </AdminButton>
        </div>

        {notice ? <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div> : null}
        {error ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {loading ? (
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-5 text-sm font-bold text-gray-500">
            <Loader2 size={17} className="animate-spin" /> Carregando regras dos prêmios...
          </div>
        ) : !campaign ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[#faf8f5] px-4 py-4 text-sm text-gray-600">
            Salve uma campanha da Roleta da Sorte primeiro para configurar o uso dos prêmios no checkout.
          </div>
        ) : prizes.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[#faf8f5] px-4 py-4 text-sm text-gray-600">
            A campanha “{campaign.name}” ainda não possui prêmios ativos para configurar.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {prizes.map((prize) => (
              <article key={prize.id} className="rounded-[22px] border border-[var(--line)] bg-white p-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Gift size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-gray-950">{prize.label}</p>
                      <p className="mt-1 text-xs font-bold text-emerald-700">{prizeDescription(prize)}</p>
                      <p className="mt-1 text-xs text-gray-500">{validityDescription(prize.reward_validity_minutes)} · uso único por recompensa</p>
                    </div>
                  </div>
                  <label>
                    <span className="mb-1.5 block text-xs font-bold uppercase text-gray-500">Pedido mínimo (R$)</span>
                    <AdminInput
                      inputMode="decimal"
                      value={prize.minimumOrder}
                      onChange={(event) => setPrizes((current) => current.map((item) => item.id === prize.id ? { ...item, minimumOrder: event.target.value } : item))}
                    />
                    <span className="mt-1 block text-[11px] text-gray-400">Use 0 para permitir em qualquer pedido.</span>
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}
