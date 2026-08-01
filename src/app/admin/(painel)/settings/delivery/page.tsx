"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calculator, MapPin, Plus, Save, Trash2 } from "lucide-react";
import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";
import { AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { useToast } from "@/components/ui/toast-provider";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { generateDeliveryTiers, normalizeDeliveryTiers } from "../delivery-pricing";
import type { DeliveryTier } from "../types";
import { DeliveryNumberField } from "./DeliveryNumberField";

interface LegacyPerKmRule {
  mode?: string;
  price_per_km?: number;
  max_distance?: number;
  time?: number;
}

export default function DeliverySettingsPage() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [tiers, setTiers] = useState<DeliveryTier[]>([]);
  const [pricePerKm, setPricePerKm] = useState(2);
  const [maxDistance, setMaxDistance] = useState(10);
  const [initialTime, setInitialTime] = useState(20);
  const [timeAtLimit, setTimeAtLimit] = useState(40);

  const fetchDeliverySettings = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user) {
        router.replace("/admin/login");
        return;
      }

      if (!restaurant) {
        throw new Error("Não foi possível identificar a loja.");
      }

      setRestaurantId(restaurant.id);
      const savedRules = Array.isArray(restaurant.delivery_tiers)
        ? restaurant.delivery_tiers
        : [];
      const legacyRule = savedRules.find(
        (rule: LegacyPerKmRule) => rule?.mode === "per_km",
      ) as LegacyPerKmRule | undefined;

      if (legacyRule) {
        const legacyPrice = Math.max(0, Number(legacyRule.price_per_km) || 0);
        const legacyDistance = Math.max(0.1, Number(legacyRule.max_distance) || 10);
        const legacyLimitTime = Math.max(0, Number(legacyRule.time) || 40);
        const legacyInitialTime = Math.min(20, legacyLimitTime);

        setPricePerKm(legacyPrice);
        setMaxDistance(legacyDistance);
        setInitialTime(legacyInitialTime);
        setTimeAtLimit(legacyLimitTime);
        setTiers(
          generateDeliveryTiers({
            pricePerKm: legacyPrice,
            maxDistance: legacyDistance,
            initialTime: legacyInitialTime,
            timeAtLimit: legacyLimitTime,
          }),
        );
      } else {
        const savedTiers = savedRules.filter(
          (rule: LegacyPerKmRule) => rule?.mode !== "per_km",
        ) as DeliveryTier[];
        setTiers(
          savedTiers.length > 0
            ? normalizeDeliveryTiers(savedTiers)
            : [{ distance: 1, time: 20, price: 0 }],
        );
      }
    } catch (error) {
      console.error(error);
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as taxas de entrega.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDeliverySettings();
  }, []);

  const handleGenerateTiers = () => {
    const generatedTiers = generateDeliveryTiers({
      pricePerKm,
      maxDistance,
      initialTime,
      timeAtLimit,
    });

    setTiers(generatedTiers);
    showToast({
      title: "Faixas calculadas",
      description: `${generatedTiers.length} ${generatedTiers.length === 1 ? "faixa foi criada" : "faixas foram criadas"}. Agora ajuste preços e prazos específicos na tabela.`,
      tone: "success",
    });
  };

  const updateTier = (index: number, field: keyof DeliveryTier, value: number) => {
    setTiers((current) =>
      current.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [field]: value } : tier,
      ),
    );
  };

  const addTier = () => {
    setTiers((current) => {
      const lastTier = current.at(-1) || { distance: 0, time: 20, price: 0 };
      return [
        ...current,
        {
          distance: Math.round((lastTier.distance + 1) * 100) / 100,
          time: lastTier.time + 5,
          price: lastTier.price,
        },
      ];
    });
  };

  const removeTier = (index: number) => {
    setTiers((current) => current.filter((_, tierIndex) => tierIndex !== index));
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    if (tiers.length === 0) {
      showToast({
        title: "Adicione uma faixa",
        description: "A loja precisa ter pelo menos uma regra de entrega configurada.",
        tone: "error",
      });
      return;
    }

    setSaving(true);
    const normalizedTiers = normalizeDeliveryTiers(tiers);

    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ delivery_tiers: normalizedTiers })
        .eq("id", restaurantId);

      if (error) throw error;

      setTiers(normalizedTiers);
      showToast({
        title: "Taxas de entrega salvas",
        description: "Os valores e prazos já estão disponíveis no checkout da vitrine.",
        tone: "success",
      });
    } catch (error) {
      console.error(error);
      showToast({
        title: "Não foi possível salvar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em alguns instantes.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <AdminPageSkeleton ariaLabel="Carregando taxas de entrega" metrics={3} />;
  }

  if (errorMsg) {
    return (
      <AdminErrorState
        description={errorMsg}
        onRetry={() => void fetchDeliverySettings()}
      />
    );
  }

  return (
    <AdminPageShell className="space-y-6 pb-20">
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-600 transition hover:text-gray-950"
        >
          <ArrowLeft size={16} />
          Voltar para configurações
        </Link>
      </div>

      <AdminPageHeader
        title="Taxas de entrega"
        description="Gere valores por quilômetro e personalize preço e prazo em cada faixa."
        icon={<MapPin size={22} />}
        action={
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="brand-gradient inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
          >
            <Save size={16} />
            {saving ? "Salvando..." : "Salvar taxas"}
          </button>
        }
      />

      <section className="surface-card min-w-0 rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-[var(--brand)]">
              <Calculator size={18} />
              <span className="text-xs font-black uppercase tracking-[0.16em]">
                Gerador automático
              </span>
            </div>
            <h2 className="mt-2 text-xl font-black text-gray-950">
              Criar uma faixa para cada quilometragem
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Digite os valores ou use os botões de menos e mais. O preço considera cada
              quilômetro iniciado e o prazo cresce do tempo inicial até o tempo no limite.
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-[var(--brand)]">
            Até {maxDistance.toLocaleString("pt-BR")} km
          </span>
        </div>

        <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-2 2xl:grid-cols-4">
          <DeliveryNumberField
            label="Valor por km"
            value={pricePerKm}
            onValueChange={setPricePerKm}
            min={0}
            step={0.5}
            decimals={2}
            prefix="R$"
            hint="Aceita vírgula ou ponto. Os botões alteram R$ 0,50."
          />

          <DeliveryNumberField
            label="Limite de entrega"
            value={maxDistance}
            onValueChange={setMaxDistance}
            min={0.1}
            step={1}
            decimals={1}
            suffix="km"
            hint="Digite a distância total ou ajuste de 1 em 1 km."
          />

          <DeliveryNumberField
            label="Tempo inicial"
            value={initialTime}
            onValueChange={setInitialTime}
            min={0}
            step={5}
            decimals={0}
            suffix="min"
            hint="Prazo usado nas entregas mais próximas."
          />

          <DeliveryNumberField
            label="Tempo no limite"
            value={timeAtLimit}
            onValueChange={setTimeAtLimit}
            min={initialTime}
            step={5}
            decimals={0}
            suffix="min"
            hint="Prazo máximo aplicado na última faixa."
          />
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-[#fcfaf7] p-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm leading-6 text-gray-600">
            Exemplo: 2,4 km será incluído na faixa de 3 km e custará{" "}
            <span className="font-black text-gray-900">
              {(Math.ceil(2.4) * pricePerKm).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>.
          </p>
          <button
            type="button"
            onClick={handleGenerateTiers}
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 text-sm font-bold text-white lg:w-auto"
          >
            <Calculator size={16} />
            Gerar faixas
          </button>
        </div>
      </section>

      <section className="surface-card min-w-0 rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">
              Ajustes individuais
            </p>
            <h2 className="mt-1 text-xl font-black text-gray-950">Faixas de distância</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Toque no número para substituir o valor inteiro ou use os botões laterais.
            </p>
          </div>
          <span className="text-sm font-bold text-gray-500">
            {tiers.length} {tiers.length === 1 ? "faixa" : "faixas"}
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {tiers.map((tier, index) => (
            <div
              key={index}
              className="grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-4 lg:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_auto] 2xl:items-end"
            >
              <DeliveryNumberField
                label="Até quantos km"
                value={tier.distance}
                onValueChange={(value) => updateTier(index, "distance", value)}
                min={0.1}
                step={0.5}
                decimals={1}
                suffix="km"
              />

              <DeliveryNumberField
                label="Tempo estimado"
                value={tier.time}
                onValueChange={(value) => updateTier(index, "time", value)}
                min={0}
                step={5}
                decimals={0}
                suffix="min"
              />

              <DeliveryNumberField
                label="Valor da entrega"
                value={tier.price}
                onValueChange={(value) => updateTier(index, "price", value)}
                min={0}
                step={0.5}
                decimals={2}
                prefix="R$"
              />

              <button
                type="button"
                onClick={() => removeTier(index)}
                aria-label={`Remover faixa de até ${tier.distance} km`}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] px-4 text-sm font-bold text-gray-500 transition hover:border-orange-200 hover:bg-[#fff0e8] hover:text-[var(--brand)] 2xl:w-12 2xl:px-0"
              >
                <Trash2 size={17} />
                <span className="2xl:hidden">Remover faixa</span>
              </button>
            </div>
          ))}

          {tiers.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[#fcfaf7] px-5 py-10 text-center">
              <p className="font-bold text-gray-800">Nenhuma faixa configurada</p>
              <p className="mt-1 text-sm text-gray-500">
                Use o gerador automático ou adicione uma faixa manualmente.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={addTier}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-600 sm:w-auto"
          >
            <Plus size={16} />
            Adicionar faixa
          </button>
        </div>
      </section>
    </AdminPageShell>
  );
}
