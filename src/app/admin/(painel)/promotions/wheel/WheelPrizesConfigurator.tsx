"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  BadgePercent,
  Check,
  CircleSlash2,
  Gift,
  Package,
  Plus,
  Scale,
  ShippingBox,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
} from "@/components/ui/admin-primitives";

type DistributionMode = "probability" | "frequency";
type PrizeType = "percent" | "fixed" | "free_shipping" | "free_product" | "no_prize";

type Prize = {
  id: string;
  type: PrizeType;
  label: string;
  value: string;
  productName: string;
  probability: string;
  frequency: string;
  quantityLimitEnabled: boolean;
  quantityLimit: string;
  customerLimitEnabled: boolean;
  customerLimit: string;
};

type CampaignPrizeLimits = {
  maxAwardsEnabled: boolean;
  maxAwards: string;
  budgetEnabled: boolean;
  budget: string;
  autoPause: boolean;
};

const DEFAULT_PRIZES: Prize[] = [
  {
    id: "default-percent",
    type: "percent",
    label: "10% de desconto",
    value: "10",
    productName: "",
    probability: "25",
    frequency: "10",
    quantityLimitEnabled: false,
    quantityLimit: "100",
    customerLimitEnabled: true,
    customerLimit: "1",
  },
  {
    id: "default-fixed",
    type: "fixed",
    label: "R$ 5 de desconto",
    value: "5",
    productName: "",
    probability: "15",
    frequency: "20",
    quantityLimitEnabled: false,
    quantityLimit: "100",
    customerLimitEnabled: true,
    customerLimit: "1",
  },
  {
    id: "default-shipping",
    type: "free_shipping",
    label: "Frete grátis",
    value: "",
    productName: "",
    probability: "10",
    frequency: "20",
    quantityLimitEnabled: false,
    quantityLimit: "100",
    customerLimitEnabled: true,
    customerLimit: "1",
  },
  {
    id: "default-no-prize",
    type: "no_prize",
    label: "Não foi dessa vez",
    value: "",
    productName: "",
    probability: "50",
    frequency: "",
    quantityLimitEnabled: false,
    quantityLimit: "",
    customerLimitEnabled: false,
    customerLimit: "",
  },
];

const DEFAULT_LIMITS: CampaignPrizeLimits = {
  maxAwardsEnabled: true,
  maxAwards: "500",
  budgetEnabled: false,
  budget: "1000",
  autoPause: true,
};

const PRIZE_META: Record<PrizeType, { label: string; icon: typeof Gift; description: string }> = {
  percent: {
    label: "Desconto percentual",
    icon: BadgePercent,
    description: "Percentual aplicado ao pedido do cliente.",
  },
  fixed: {
    label: "Desconto fixo",
    icon: Wallet,
    description: "Valor em reais descontado do pedido.",
  },
  free_shipping: {
    label: "Frete grátis",
    icon: ShippingBox,
    description: "Zera a taxa de entrega de um pedido elegível.",
  },
  free_product: {
    label: "Produto grátis",
    icon: Package,
    description: "Entrega um item do cardápio como recompensa.",
  },
  no_prize: {
    label: "Não foi dessa vez",
    icon: CircleSlash2,
    description: "Resultado sem benefício promocional.",
  },
};

function parseNumber(value: string) {
  return Number(value.replace(",", "."));
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function createPrize(type: PrizeType): Prize {
  const meta = PRIZE_META[type];
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: meta.label,
    value: type === "percent" ? "10" : type === "fixed" ? "5" : "",
    productName: "",
    probability: type === "no_prize" ? "20" : "10",
    frequency: type === "no_prize" ? "" : "10",
    quantityLimitEnabled: false,
    quantityLimit: "100",
    customerLimitEnabled: type !== "no_prize",
    customerLimit: "1",
  };
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
        checked ? "border-orange-300 bg-[var(--brand)]" : "border-gray-200 bg-gray-100"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function SectionTitle({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
        {icon}
      </span>
      <div>
        <h2 className="text-base font-black text-gray-950 sm:text-lg">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
      </div>
    </div>
  );
}

export default function WheelPrizesConfigurator() {
  const [mode, setMode] = useState<DistributionMode>("probability");
  const [prizes, setPrizes] = useState<Prize[]>(DEFAULT_PRIZES);
  const [limits, setLimits] = useState<CampaignPrizeLimits>(DEFAULT_LIMITS);
  const [showValidation, setShowValidation] = useState(false);

  const updatePrize = <K extends keyof Prize>(id: string, key: K, value: Prize[K]) => {
    setPrizes((current) => current.map((prize) => (prize.id === id ? { ...prize, [key]: value } : prize)));
    setShowValidation(false);
  };

  const addPrize = (type: PrizeType) => {
    setPrizes((current) => [...current, createPrize(type)]);
    setShowValidation(false);
  };

  const removePrize = (id: string) => {
    setPrizes((current) => current.filter((prize) => prize.id !== id));
    setShowValidation(false);
  };

  const probabilityTotal = useMemo(
    () => prizes.reduce((total, prize) => total + Math.max(0, parseNumber(prize.probability) || 0), 0),
    [prizes],
  );

  const winningPrizes = useMemo(() => prizes.filter((prize) => prize.type !== "no_prize"), [prizes]);

  const frequencyChance = useMemo(
    () =>
      winningPrizes.reduce((total, prize) => {
        const every = parseNumber(prize.frequency);
        if (!Number.isFinite(every) || every <= 0) return total;
        return total + 100 / every;
      }, 0),
    [winningPrizes],
  );

  const fallbackChance = Math.max(0, 100 - frequencyChance);
  const hasNoPrize = prizes.some((prize) => prize.type === "no_prize");

  const errors = useMemo(() => {
    const issues: string[] = [];

    if (prizes.length < 2) issues.push("Adicione pelo menos dois resultados à roleta.");
    if (winningPrizes.length === 0) issues.push("A roleta precisa ter pelo menos um prêmio real.");
    if (prizes.length > 12) issues.push("Use no máximo 12 resultados para manter a roleta legível.");

    prizes.forEach((prize, index) => {
      const position = index + 1;
      if (prize.label.trim().length < 2) issues.push(`O resultado ${position} precisa de um nome.`);

      if (prize.type === "percent") {
        const value = parseNumber(prize.value);
        if (!Number.isFinite(value) || value <= 0 || value > 100) {
          issues.push(`${prize.label || `Resultado ${position}`}: o desconto percentual deve ficar entre 0 e 100%.`);
        }
      }

      if (prize.type === "fixed") {
        const value = parseNumber(prize.value);
        if (!Number.isFinite(value) || value <= 0) {
          issues.push(`${prize.label || `Resultado ${position}`}: informe um desconto fixo maior que zero.`);
        }
      }

      if (prize.type === "free_product" && prize.productName.trim().length < 2) {
        issues.push(`${prize.label || `Resultado ${position}`}: informe qual produto será entregue.`);
      }

      if (mode === "probability") {
        const chance = parseNumber(prize.probability);
        if (!Number.isFinite(chance) || chance <= 0 || chance > 100) {
          issues.push(`${prize.label || `Resultado ${position}`}: a probabilidade deve ser maior que 0 e no máximo 100%.`);
        }
      }

      if (mode === "frequency" && prize.type !== "no_prize") {
        const every = parseNumber(prize.frequency);
        if (!Number.isInteger(every) || every < 1) {
          issues.push(`${prize.label || `Resultado ${position}`}: a frequência precisa ser um número inteiro de giros.`);
        }
      }

      if (prize.type !== "no_prize" && prize.quantityLimitEnabled) {
        const totalLimit = parseNumber(prize.quantityLimit);
        if (!Number.isInteger(totalLimit) || totalLimit < 1) {
          issues.push(`${prize.label || `Resultado ${position}`}: o limite total precisa ser de pelo menos 1 unidade.`);
        }
      }

      if (prize.type !== "no_prize" && prize.customerLimitEnabled) {
        const perCustomer = parseNumber(prize.customerLimit);
        if (!Number.isInteger(perCustomer) || perCustomer < 1) {
          issues.push(`${prize.label || `Resultado ${position}`}: o limite por cliente precisa ser de pelo menos 1.`);
        }
        if (prize.quantityLimitEnabled) {
          const totalLimit = parseNumber(prize.quantityLimit);
          if (Number.isFinite(totalLimit) && Number.isFinite(perCustomer) && perCustomer > totalLimit) {
            issues.push(`${prize.label || `Resultado ${position}`}: o limite por cliente não pode superar o estoque total.`);
          }
        }
      }
    });

    if (mode === "probability" && Math.abs(probabilityTotal - 100) > 0.001) {
      issues.push(`As probabilidades precisam somar 100%. O total atual é ${formatPercent(probabilityTotal)}.`);
    }

    if (mode === "frequency") {
      if (frequencyChance > 100.001) {
        issues.push(`As frequências equivalem a ${formatPercent(frequencyChance)}, acima dos 100% disponíveis.`);
      }
      if (frequencyChance < 99.999 && !hasNoPrize) {
        issues.push("Adicione “Não foi dessa vez” para representar os giros restantes sem prêmio.");
      }
    }

    if (limits.maxAwardsEnabled) {
      const maxAwards = parseNumber(limits.maxAwards);
      if (!Number.isInteger(maxAwards) || maxAwards < 1) {
        issues.push("O limite de prêmios da campanha precisa ser de pelo menos 1.");
      }
    }

    if (limits.budgetEnabled) {
      const budget = parseNumber(limits.budget);
      if (!Number.isFinite(budget) || budget <= 0) {
        issues.push("O orçamento promocional precisa ser maior que zero.");
      }
    }

    return issues;
  }, [frequencyChance, hasNoPrize, limits, mode, prizes, probabilityTotal, winningPrizes.length]);

  const distributionStatus = mode === "probability"
    ? Math.abs(probabilityTotal - 100) <= 0.001
      ? "Distribuição fechada em 100%"
      : `${formatPercent(probabilityTotal)} configurados · ${formatPercent(Math.abs(100 - probabilityTotal))} ${probabilityTotal < 100 ? "restantes" : "excedentes"}`
    : `${formatPercent(frequencyChance)} em prêmios · ${formatPercent(fallbackChance)} sem prêmio`;

  return (
    <div className="admin-page-shell -mt-6 space-y-6 pb-12">
      <section className="surface-card rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <SectionTitle
            icon={<Gift size={18} />}
            title="Prêmios e distribuição"
            description="Defina os resultados da roleta e escolha como cada um será distribuído entre os giros elegíveis."
          />

          <div className="inline-flex rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("probability");
                setShowValidation(false);
              }}
              className={`min-h-10 rounded-xl px-4 text-sm font-black transition-colors ${
                mode === "probability" ? "bg-white text-[var(--brand)] shadow-sm" : "text-gray-500"
              }`}
            >
              Probabilidade (%)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("frequency");
                setShowValidation(false);
              }}
              className={`min-h-10 rounded-xl px-4 text-sm font-black transition-colors ${
                mode === "frequency" ? "bg-white text-[var(--brand)] shadow-sm" : "text-gray-500"
              }`}
            >
              1 a cada X giros
            </button>
          </div>
        </div>

        <div className={`mt-5 rounded-[20px] border px-4 py-3 text-sm ${
          (mode === "probability" && Math.abs(probabilityTotal - 100) <= 0.001) ||
          (mode === "frequency" && frequencyChance <= 100.001)
            ? "border-emerald-100 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          <div className="flex items-center gap-2">
            <Scale size={17} className="shrink-0" />
            <p className="font-bold">{distributionStatus}</p>
          </div>
          <p className="mt-1 pl-6 leading-5 opacity-80">
            {mode === "probability"
              ? "A soma de todos os resultados deve ser exatamente 100%."
              : "Cada prêmio usa uma frequência fixa. Giros não ocupados por prêmios ficam como resultado sem prêmio."}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        {prizes.map((prize, index) => {
          const meta = PRIZE_META[prize.type];
          const Icon = meta.icon;
          const every = parseNumber(prize.frequency);
          const effectiveChance = prize.type === "no_prize"
            ? fallbackChance
            : Number.isFinite(every) && every > 0
              ? 100 / every
              : 0;

          return (
            <article key={prize.id} className="surface-card rounded-[26px] p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
                  <Icon size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">Resultado {index + 1}</p>
                      <h3 className="mt-1 font-black text-gray-950">{meta.label}</h3>
                      <p className="mt-1 text-sm text-gray-500">{meta.description}</p>
                    </div>
                    <AdminButton
                      variant="ghost"
                      className="min-h-9 px-2.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => removePrize(prize.id)}
                      aria-label={`Remover ${prize.label}`}
                    >
                      <Trash2 size={16} />
                      Remover
                    </AdminButton>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Tipo</span>
                      <AdminSelect
                        value={prize.type}
                        onChange={(event) => {
                          const nextType = event.target.value as PrizeType;
                          const next = createPrize(nextType);
                          setPrizes((current) => current.map((item) => item.id === prize.id ? { ...next, id: item.id } : item));
                          setShowValidation(false);
                        }}
                      >
                        <option value="percent">Desconto percentual</option>
                        <option value="fixed">Desconto fixo</option>
                        <option value="free_shipping">Frete grátis</option>
                        <option value="free_product">Produto grátis</option>
                        <option value="no_prize">Não foi dessa vez</option>
                      </AdminSelect>
                    </label>

                    <label className="block md:col-span-1 xl:col-span-2">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Nome exibido</span>
                      <AdminInput
                        value={prize.label}
                        maxLength={60}
                        onChange={(event) => updatePrize(prize.id, "label", event.target.value)}
                        placeholder="Ex.: Você ganhou 10% OFF"
                      />
                    </label>

                    {prize.type === "percent" ? (
                      <label className="block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Desconto (%)</span>
                        <AdminInput
                          type="number"
                          min={0.01}
                          max={100}
                          step="0.01"
                          value={prize.value}
                          onChange={(event) => updatePrize(prize.id, "value", event.target.value)}
                        />
                      </label>
                    ) : null}

                    {prize.type === "fixed" ? (
                      <label className="block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Desconto (R$)</span>
                        <AdminInput
                          inputMode="decimal"
                          value={prize.value}
                          onChange={(event) => updatePrize(prize.id, "value", event.target.value)}
                          placeholder="5,00"
                        />
                      </label>
                    ) : null}

                    {prize.type === "free_product" ? (
                      <label className="block md:col-span-2">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Produto</span>
                        <AdminInput
                          value={prize.productName}
                          onChange={(event) => updatePrize(prize.id, "productName", event.target.value)}
                          placeholder="Ex.: Batata frita pequena"
                        />
                        <span className="mt-1.5 block text-xs text-gray-400">Na Frente 5 este campo será conectado ao item real do cardápio.</span>
                      </label>
                    ) : null}

                    {mode === "probability" ? (
                      <label className="block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Probabilidade (%)</span>
                        <AdminInput
                          type="number"
                          min={0.01}
                          max={100}
                          step="0.01"
                          value={prize.probability}
                          onChange={(event) => updatePrize(prize.id, "probability", event.target.value)}
                        />
                      </label>
                    ) : prize.type === "no_prize" ? (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                        Preenche automaticamente os <strong>{formatPercent(fallbackChance)}</strong> restantes.
                      </div>
                    ) : (
                      <label className="block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">1 prêmio a cada</span>
                        <div className="flex items-center gap-2">
                          <AdminInput
                            type="number"
                            min={1}
                            step="1"
                            value={prize.frequency}
                            onChange={(event) => updatePrize(prize.id, "frequency", event.target.value)}
                            className="max-w-28"
                          />
                          <span className="text-sm text-gray-500">giros</span>
                        </div>
                        <span className="mt-1.5 block text-xs text-gray-400">Equivale a {formatPercent(effectiveChance)} dos giros.</span>
                      </label>
                    )}
                  </div>

                  {prize.type !== "no_prize" ? (
                    <div className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5 lg:grid-cols-2">
                      <div className={`rounded-[20px] border p-4 ${prize.quantityLimitEnabled ? "border-orange-200 bg-[#fffaf6]" : "border-[var(--line)] bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-gray-950">Limite total do prêmio</p>
                            <p className="mt-1 text-xs leading-5 text-gray-500">Máximo de vezes que este prêmio poderá ser distribuído.</p>
                          </div>
                          <Toggle
                            checked={prize.quantityLimitEnabled}
                            onChange={() => updatePrize(prize.id, "quantityLimitEnabled", !prize.quantityLimitEnabled)}
                            label={`Limitar estoque de ${prize.label}`}
                          />
                        </div>
                        {prize.quantityLimitEnabled ? (
                          <AdminInput
                            type="number"
                            min={1}
                            step="1"
                            value={prize.quantityLimit}
                            onChange={(event) => updatePrize(prize.id, "quantityLimit", event.target.value)}
                            className="mt-3 max-w-40"
                          />
                        ) : null}
                      </div>

                      <div className={`rounded-[20px] border p-4 ${prize.customerLimitEnabled ? "border-orange-200 bg-[#fffaf6]" : "border-[var(--line)] bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-gray-950">Limite por cliente</p>
                            <p className="mt-1 text-xs leading-5 text-gray-500">Evita que uma pessoa ganhe o mesmo prêmio muitas vezes.</p>
                          </div>
                          <Toggle
                            checked={prize.customerLimitEnabled}
                            onChange={() => updatePrize(prize.id, "customerLimitEnabled", !prize.customerLimitEnabled)}
                            label={`Limitar ${prize.label} por cliente`}
                          />
                        </div>
                        {prize.customerLimitEnabled ? (
                          <AdminInput
                            type="number"
                            min={1}
                            step="1"
                            value={prize.customerLimit}
                            onChange={(event) => updatePrize(prize.id, "customerLimit", event.target.value)}
                            className="mt-3 max-w-40"
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="surface-card rounded-[28px] p-5 sm:p-6">
        <SectionTitle
          icon={<Plus size={18} />}
          title="Adicionar resultado"
          description="Inclua novos segmentos até chegar à composição ideal da roleta."
        />
        <div className="mt-5 flex flex-wrap gap-2">
          {(Object.keys(PRIZE_META) as PrizeType[]).map((type) => {
            const meta = PRIZE_META[type];
            const Icon = meta.icon;
            return (
              <AdminButton key={type} variant="secondary" onClick={() => addPrize(type)} disabled={prizes.length >= 12}>
                <Icon size={16} />
                {meta.label}
              </AdminButton>
            );
          })}
        </div>
        {prizes.length >= 12 ? <p className="mt-3 text-xs font-bold text-amber-700">Limite visual de 12 resultados atingido.</p> : null}
      </section>

      <section className="surface-card rounded-[28px] p-5 sm:p-6">
        <SectionTitle
          icon={<Scale size={18} />}
          title="Limites da campanha"
          description="Defina travas gerais para controlar quantidade de benefícios e investimento promocional."
        />

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className={`rounded-[22px] border p-4 sm:p-5 ${limits.maxAwardsEnabled ? "border-orange-200 bg-[#fffaf6]" : "border-[var(--line)]"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-gray-950">Máximo de prêmios distribuídos</p>
                <p className="mt-1 text-sm leading-5 text-gray-500">Conta apenas resultados que geram benefício real.</p>
              </div>
              <Toggle
                checked={limits.maxAwardsEnabled}
                onChange={() => {
                  setLimits((current) => ({ ...current, maxAwardsEnabled: !current.maxAwardsEnabled }));
                  setShowValidation(false);
                }}
                label="Limitar prêmios da campanha"
              />
            </div>
            {limits.maxAwardsEnabled ? (
              <AdminInput
                type="number"
                min={1}
                step="1"
                value={limits.maxAwards}
                onChange={(event) => {
                  setLimits((current) => ({ ...current, maxAwards: event.target.value }));
                  setShowValidation(false);
                }}
                className="mt-4 max-w-44"
              />
            ) : null}
          </div>

          <div className={`rounded-[22px] border p-4 sm:p-5 ${limits.budgetEnabled ? "border-orange-200 bg-[#fffaf6]" : "border-[var(--line)]"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-gray-950">Orçamento promocional</p>
                <p className="mt-1 text-sm leading-5 text-gray-500">Teto financeiro estimado para os benefícios da campanha.</p>
              </div>
              <Toggle
                checked={limits.budgetEnabled}
                onChange={() => {
                  setLimits((current) => ({ ...current, budgetEnabled: !current.budgetEnabled }));
                  setShowValidation(false);
                }}
                label="Limitar orçamento da campanha"
              />
            </div>
            {limits.budgetEnabled ? (
              <div className="relative mt-4 max-w-52">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-gray-400">R$</span>
                <AdminInput
                  className="pl-11"
                  inputMode="decimal"
                  value={limits.budget}
                  onChange={(event) => {
                    setLimits((current) => ({ ...current, budget: event.target.value }));
                    setShowValidation(false);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-start justify-between gap-4 rounded-[22px] border border-[var(--line)] bg-[#fffdfa] p-4 sm:p-5">
          <div>
            <p className="font-black text-gray-950">Pausar automaticamente ao atingir um limite</p>
            <p className="mt-1 text-sm leading-5 text-gray-500">Quando o backend for conectado, a campanha para de distribuir novos prêmios ao esgotar estoque ou orçamento.</p>
          </div>
          <Toggle
            checked={limits.autoPause}
            onChange={() => setLimits((current) => ({ ...current, autoPause: !current.autoPause }))}
            label="Pausar campanha ao atingir limites"
          />
        </div>
      </section>

      <section className="surface-card rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Validação automática</p>
            <h2 className="mt-2 text-lg font-black text-gray-950">Prêmios e distribuição</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">Confira a consistência antes de conectar esta configuração ao motor seguro da Frente 5.</p>
          </div>
          <AdminButton onClick={() => setShowValidation(true)}>
            <Check size={16} />
            Validar prêmios
          </AdminButton>
        </div>

        {showValidation ? (
          <div className={`mt-5 rounded-[22px] border p-4 ${errors.length ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`} aria-live="polite">
            {errors.length ? (
              <>
                <p className="font-black text-red-800">Revise {errors.length} ponto(s)</p>
                <ul className="mt-3 space-y-2 text-sm leading-5 text-red-700">
                  {errors.map((error) => (
                    <li key={error} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                  <Check size={18} />
                </span>
                <div>
                  <p className="font-black text-emerald-800">Distribuição válida</p>
                  <p className="mt-1 text-sm leading-5 text-emerald-700">
                    Os prêmios, probabilidades/frequências e limites estão consistentes para persistência na próxima frente.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-[24px] border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-800">
        Esta frente configura e valida o motor, mas ainda não sorteia nem salva resultados. Na Frente 5, campanha, prêmios, frequências e limites serão persistidos e executados no servidor para impedir manipulação pelo navegador.
      </section>
    </div>
  );
}
