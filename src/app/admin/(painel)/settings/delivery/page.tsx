"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  MapPin,
  Plus,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";
import { AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { useToast } from "@/components/ui/toast-provider";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import {
  generateDeliveryTiers,
  normalizeDeliveryTiers,
  serializeDeliveryTiers,
  validateDeliveryTiers,
} from "../delivery-pricing";
import type { DeliveryTier } from "../types";
import { DeliveryNumberField } from "./DeliveryNumberField";

interface LegacyPerKmRule {
  mode?: string;
  price_per_km?: number;
  max_distance?: number;
  time?: number;
}

type EditableDeliveryTier = DeliveryTier & {
  editorId: string;
};

let tierEditorSequence = 0;

function createTierEditorId() {
  tierEditorSequence += 1;
  return `delivery-tier-${tierEditorSequence}`;
}

function toEditableTiers(tiers: DeliveryTier[]): EditableDeliveryTier[] {
  return tiers.map((tier) => ({ ...tier, editorId: createTierEditorId() }));
}

function toPlainTiers(tiers: EditableDeliveryTier[]): DeliveryTier[] {
  return tiers.map(({ editorId: _editorId, ...tier }) => tier);
}

function distanceKey(distance: number) {
  return Number(distance).toFixed(2);
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
  const [tiers, setTiers] = useState<EditableDeliveryTier[]>([]);
  const [savedTiers, setSavedTiers] = useState<DeliveryTier[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [pricePerKm, setPricePerKm] = useState(2);
  const [maxDistance, setMaxDistance] = useState(10);
  const [initialTime, setInitialTime] = useState(20);
  const [timeAtLimit, setTimeAtLimit] = useState(40);

  const plainTiers = useMemo(() => toPlainTiers(tiers), [tiers]);
  const validation = useMemo(() => validateDeliveryTiers(plainTiers), [plainTiers]);
  const currentSnapshot = useMemo(
    () => serializeDeliveryTiers(plainTiers),
    [plainTiers],
  );
  const hasUnsavedChanges = !loading && currentSnapshot !== savedSnapshot;
  const duplicateDistanceKeys = useMemo(
    () => new Set(validation.duplicateDistances.map(distanceKey)),
    [validation.duplicateDistances],
  );
  const deliverySummary = useMemo(() => {
    const normalizedTiers = validation.normalizedTiers;
    const firstTier = normalizedTiers[0];
    const lastTier = normalizedTiers.at(-1);

    return {
      maxDistance: lastTier?.distance ?? 0,
      minimumPrice:
        normalizedTiers.length > 0
          ? Math.min(...normalizedTiers.map((tier) => tier.price))
          : 0,
      maximumPrice:
        normalizedTiers.length > 0
          ? Math.max(...normalizedTiers.map((tier) => tier.price))
          : 0,
      minimumTime:
        normalizedTiers.length > 0
          ? Math.min(...normalizedTiers.map((tier) => tier.time))
          : 0,
      maximumTime:
        normalizedTiers.length > 0
          ? Math.max(...normalizedTiers.map((tier) => tier.time))
          : 0,
      firstTier,
    };
  }, [validation.normalizedTiers]);

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
      let loadedTiers: DeliveryTier[];

      if (legacyRule) {
        const legacyPrice = Math.max(0, Number(legacyRule.price_per_km) || 0);
        const legacyDistance = Math.max(0.1, Number(legacyRule.max_distance) || 10);
        const legacyLimitTime = Math.max(0, Number(legacyRule.time) || 40);
        const legacyInitialTime = Math.min(20, legacyLimitTime);

        setPricePerKm(legacyPrice);
        setMaxDistance(legacyDistance);
        setInitialTime(legacyInitialTime);
        setTimeAtLimit(legacyLimitTime);
        loadedTiers = generateDeliveryTiers({
          pricePerKm: legacyPrice,
          maxDistance: legacyDistance,
          initialTime: legacyInitialTime,
          timeAtLimit: legacyLimitTime,
        });
      } else {
        const storedTiers = savedRules.filter(
          (rule: LegacyPerKmRule) => rule?.mode !== "per_km",
        ) as DeliveryTier[];
        loadedTiers =
          storedTiers.length > 0
            ? normalizeDeliveryTiers(storedTiers)
            : [{ distance: 1, time: 20, price: 0 }];

        const firstTier = loadedTiers[0];
        const lastTier = loadedTiers.at(-1);
        setPricePerKm(
          firstTier
            ? Math.round((firstTier.price / Math.max(1, Math.ceil(firstTier.distance))) * 100) /
                100
            : 2,
        );
        setMaxDistance(lastTier?.distance ?? 10);
        setInitialTime(firstTier?.time ?? 20);
        setTimeAtLimit(lastTier?.time ?? 40);
      }

      const normalizedLoadedTiers = normalizeDeliveryTiers(loadedTiers);
      const hasStoredRules = savedRules.length > 0;
      const persistedTiers = hasStoredRules ? normalizedLoadedTiers : [];

      setTiers(toEditableTiers(normalizedLoadedTiers));
      setSavedTiers(persistedTiers);
      setSavedSnapshot(serializeDeliveryTiers(persistedTiers));
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

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  const handleGenerateTiers = () => {
    if (
      tiers.length > 0 &&
      !window.confirm(
        "Gerar novamente substituirá todas as faixas exibidas. Deseja continuar?",
      )
    ) {
      return;
    }

    const generatedTiers = generateDeliveryTiers({
      pricePerKm,
      maxDistance,
      initialTime,
      timeAtLimit,
    });

    setTiers(toEditableTiers(generatedTiers));
    showToast({
      title: "Faixas calculadas",
      description: `${generatedTiers.length} ${generatedTiers.length === 1 ? "faixa foi criada" : "faixas foram criadas"}. Agora ajuste preços e prazos específicos na tabela.`,
      tone: "success",
    });
  };

  const updateTier = (
    editorId: string,
    field: keyof DeliveryTier,
    value: number,
  ) => {
    setTiers((current) =>
      current.map((tier) =>
        tier.editorId === editorId ? { ...tier, [field]: value } : tier,
      ),
    );
  };

  const addTier = () => {
    setTiers((current) => {
      const lastTier = [...current].sort((first, second) => first.distance - second.distance).at(-1) || {
        distance: 0,
        time: 20,
        price: 0,
        editorId: createTierEditorId(),
      };

      return [
        ...current,
        {
          editorId: createTierEditorId(),
          distance: Math.round((lastTier.distance + 1) * 100) / 100,
          time: lastTier.time + 5,
          price: lastTier.price,
        },
      ];
    });
  };

  const removeTier = (editorId: string) => {
    setTiers((current) => current.filter((tier) => tier.editorId !== editorId));
  };

  const handleDiscardChanges = () => {
    if (!window.confirm("Descartar todas as alterações feitas nesta tela?")) return;
    setTiers(toEditableTiers(savedTiers));
  };

  const handleSave = async () => {
    if (!restaurantId || saving) return;

    if (!validation.isValid) {
      showToast({
        title: "Revise as faixas",
        description: validation.errors[0] || "Existem dados que precisam ser corrigidos.",
        tone: "error",
      });
      return;
    }

    setSaving(true);
    const normalizedTiers = validation.normalizedTiers;

    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ delivery_tiers: normalizedTiers })
        .eq("id", restaurantId);

      if (error) throw error;

      setTiers(toEditableTiers(normalizedTiers));
      setSavedTiers(normalizedTiers);
      setSavedSnapshot(serializeDeliveryTiers(normalizedTiers));
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

  const statusTone = validation.errors.length > 0
    ? "error"
    : validation.warnings.length > 0
      ? "warning"
      : hasUnsavedChanges
        ? "pending"
        : "success";

  return (
    <AdminPageShell className="space-y-6 pb-28">
      <div>
        <Link
          href="/admin/settings"
          onClick={(event) => {
            if (
              hasUnsavedChanges &&
              !window.confirm("Existem alterações não salvas. Deseja sair mesmo assim?")
            ) {
              event.preventDefault();
            }
          }}
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
            disabled={saving || !validation.isValid || !hasUnsavedChanges}
            className="brand-gradient inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Save size={16} />
            {saving ? "Salvando..." : hasUnsavedChanges ? "Salvar alterações" : "Tudo salvo"}
          </button>
        }
      />

      <section
        aria-live="polite"
        className={`rounded-2xl border px-4 py-4 ${
          statusTone === "error"
            ? "border-red-200 bg-red-50"
            : statusTone === "warning"
              ? "border-amber-200 bg-amber-50"
              : statusTone === "pending"
                ? "border-orange-200 bg-orange-50"
                : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex items-start gap-3">
          {statusTone === "error" || statusTone === "warning" ? (
            <AlertTriangle
              size={20}
              className={statusTone === "error" ? "mt-0.5 text-red-600" : "mt-0.5 text-amber-600"}
            />
          ) : (
            <CheckCircle2
              size={20}
              className={statusTone === "pending" ? "mt-0.5 text-[var(--brand)]" : "mt-0.5 text-emerald-600"}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-black text-gray-950">
              {statusTone === "error"
                ? "Corrija os dados antes de salvar"
                : statusTone === "warning"
                  ? "Revise as exceções configuradas"
                  : statusTone === "pending"
                    ? "Alterações prontas para salvar"
                    : "Configuração atualizada"}
            </p>
            <div className="mt-1 space-y-1 text-sm leading-6 text-gray-600">
              {validation.errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
              {validation.errors.length === 0 &&
                validation.warnings.map((message) => <p key={message}>{message}</p>)}
              {validation.errors.length === 0 && validation.warnings.length === 0 && (
                <p>
                  {hasUnsavedChanges
                    ? "Revise a tabela e salve para publicar os novos valores no checkout."
                    : "Preço, distância e prazo estão salvos e prontos para uso na vitrine."}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

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
            onValueChange={(value) => {
              setInitialTime(value);
              setTimeAtLimit((current) => Math.max(current, value));
            }}
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
          <div>
            <p className="text-sm leading-6 text-gray-600">
              Exemplo: 2,4 km será incluído na faixa de 3 km e custará{" "}
              <span className="font-black text-gray-900">
                {(Math.ceil(2.4) * pricePerKm).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>.
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Ao recalcular, as faixas atuais serão substituídas. Os valores só chegam à vitrine depois de salvar.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateTiers}
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 text-sm font-bold text-white lg:w-auto"
          >
            <Calculator size={16} />
            {tiers.length > 0 ? "Recalcular faixas" : "Gerar faixas"}
          </button>
        </div>
      </section>

      <section className="surface-card min-w-0 rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">
              Ajustes individuais
            </p>
            <h2 className="mt-1 text-xl font-black text-gray-950">Faixas de distância</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Toque no número para substituir o valor inteiro ou use os botões laterais.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <span className="rounded-xl bg-[#fcfaf7] px-3 py-2 font-bold text-gray-600">
              {tiers.length} {tiers.length === 1 ? "faixa" : "faixas"}
            </span>
            <span className="rounded-xl bg-[#fcfaf7] px-3 py-2 font-bold text-gray-600">
              Até {deliverySummary.maxDistance.toLocaleString("pt-BR")} km
            </span>
            <span className="rounded-xl bg-[#fcfaf7] px-3 py-2 font-bold text-gray-600">
              {deliverySummary.minimumPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}–{deliverySummary.maximumPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
            <span className="rounded-xl bg-[#fcfaf7] px-3 py-2 font-bold text-gray-600">
              {deliverySummary.minimumTime}–{deliverySummary.maximumTime} min
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {tiers.map((tier) => {
            const duplicatedDistance = duplicateDistanceKeys.has(distanceKey(tier.distance));

            return (
              <div
                key={tier.editorId}
                className={`grid min-w-0 gap-4 rounded-2xl border bg-white p-4 lg:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_auto] 2xl:items-end ${
                  duplicatedDistance ? "border-red-200" : "border-[var(--line)]"
                }`}
              >
                <DeliveryNumberField
                  label="Até quantos km"
                  value={tier.distance}
                  onValueChange={(value) => updateTier(tier.editorId, "distance", value)}
                  min={0.1}
                  step={0.5}
                  decimals={1}
                  suffix="km"
                  error={duplicatedDistance ? "Já existe outra faixa com essa distância." : undefined}
                />

                <DeliveryNumberField
                  label="Tempo estimado"
                  value={tier.time}
                  onValueChange={(value) => updateTier(tier.editorId, "time", value)}
                  min={0}
                  step={5}
                  decimals={0}
                  suffix="min"
                />

                <DeliveryNumberField
                  label="Valor da entrega"
                  value={tier.price}
                  onValueChange={(value) => updateTier(tier.editorId, "price", value)}
                  min={0}
                  step={0.5}
                  decimals={2}
                  prefix="R$"
                />

                <button
                  type="button"
                  onClick={() => removeTier(tier.editorId)}
                  aria-label={`Remover faixa de até ${tier.distance} km`}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] px-4 text-sm font-bold text-gray-500 transition hover:border-orange-200 hover:bg-[#fff0e8] hover:text-[var(--brand)] 2xl:w-12 2xl:px-0"
                >
                  <Trash2 size={17} />
                  <span className="2xl:hidden">Remover faixa</span>
                </button>
              </div>
            );
          })}

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

      {hasUnsavedChanges && (
        <section className="sticky bottom-3 z-30 rounded-2xl border border-orange-200 bg-white/95 p-3 shadow-[0_18px_50px_rgba(28,25,23,0.18)] backdrop-blur sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-gray-950">Alterações não salvas</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                {validation.isValid
                  ? "Salve para publicar as novas taxas e prazos no checkout."
                  : "Corrija os itens destacados para liberar o salvamento."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-600 disabled:opacity-50"
              >
                <Undo2 size={16} />
                Descartar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !validation.isValid}
                className="brand-gradient inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </section>
      )}
    </AdminPageShell>
  );
}
