"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  Coins,
  Gift,
  Info,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Target,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  AdminButton,
  AdminInput,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
} from "@/components/ui/admin-primitives";

type CampaignStatus = "draft" | "scheduled" | "active" | "paused";
type RuleKey =
  | "afterOrder"
  | "minimumOrder"
  | "everyOrders"
  | "everySpend"
  | "firstPurchase"
  | "schedule"
  | "customerLimit";

type WheelConfig = {
  name: string;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  afterOrder: boolean;
  minimumOrder: boolean;
  minimumOrderValue: string;
  everyOrders: boolean;
  everyOrdersCount: string;
  everySpend: boolean;
  everySpendValue: string;
  firstPurchase: boolean;
  schedule: boolean;
  weekdays: number[];
  startTime: string;
  endTime: string;
  customerLimit: boolean;
  maxSpins: string;
  limitPeriod: "day" | "week" | "campaign";
};

const DEFAULT_CONFIG: WheelConfig = {
  name: "",
  status: "draft",
  startsAt: "",
  endsAt: "",
  afterOrder: true,
  minimumOrder: false,
  minimumOrderValue: "50",
  everyOrders: false,
  everyOrdersCount: "3",
  everySpend: false,
  everySpendValue: "100",
  firstPurchase: false,
  schedule: false,
  weekdays: [1, 2, 3, 4, 5, 6, 0],
  startTime: "11:00",
  endTime: "23:00",
  customerLimit: true,
  maxSpins: "2",
  limitPeriod: "week",
};

const WEEKDAYS = [
  { value: 1, short: "Seg", label: "Segunda-feira" },
  { value: 2, short: "Ter", label: "Terça-feira" },
  { value: 3, short: "Qua", label: "Quarta-feira" },
  { value: 4, short: "Qui", label: "Quinta-feira" },
  { value: 5, short: "Sex", label: "Sexta-feira" },
  { value: 6, short: "Sáb", label: "Sábado" },
  { value: 0, short: "Dom", label: "Domingo" },
];

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  active: "Ativa",
  paused: "Pausada",
};

const STATUS_CLASSES: Record<CampaignStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
};

function formatMoneyInput(value: string) {
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
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

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
        checked
          ? "border-orange-300 bg-[var(--brand)]"
          : "border-gray-200 bg-gray-100"
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

function RuleCard({
  icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <article
      className={`rounded-[22px] border p-4 transition-colors sm:p-5 ${
        enabled
          ? "border-orange-200 bg-[#fffaf6]"
          : "border-[var(--line)] bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            enabled
              ? "bg-white text-[var(--brand)] shadow-sm"
              : "bg-gray-50 text-gray-400"
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-gray-950">{title}</p>
          <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} label={title} />
      </div>

      {enabled && children ? (
        <div className="mt-4 border-t border-orange-100 pt-4">{children}</div>
      ) : null}
    </article>
  );
}

export default function WheelConfigurator() {
  const [config, setConfig] = useState<WheelConfig>(DEFAULT_CONFIG);
  const [showValidation, setShowValidation] = useState(false);

  const update = <K extends keyof WheelConfig>(key: K, value: WheelConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setShowValidation(false);
  };

  const toggleRule = (key: RuleKey) => {
    update(key, !config[key] as WheelConfig[typeof key]);
  };

  const toggleWeekday = (weekday: number) => {
    update(
      "weekdays",
      config.weekdays.includes(weekday)
        ? config.weekdays.filter((day) => day !== weekday)
        : [...config.weekdays, weekday],
    );
  };

  const errors = useMemo(() => {
    const issues: string[] = [];
    const enabledReleaseRules = [
      config.afterOrder,
      config.minimumOrder,
      config.everyOrders,
      config.everySpend,
      config.firstPurchase,
    ].filter(Boolean).length;

    if (config.name.trim().length < 3) {
      issues.push("Informe um nome de campanha com pelo menos 3 caracteres.");
    }

    if (!config.startsAt || !config.endsAt) {
      issues.push("Defina a data e hora de início e fim da campanha.");
    } else if (new Date(config.endsAt).getTime() <= new Date(config.startsAt).getTime()) {
      issues.push("O fim da campanha precisa acontecer depois do início.");
    }

    if (enabledReleaseRules === 0) {
      issues.push("Ative pelo menos uma regra para liberar giros.");
    }

    if (config.minimumOrder && Number(config.minimumOrderValue.replace(",", ".")) <= 0) {
      issues.push("Informe um valor mínimo de pedido maior que zero.");
    }

    if (config.everyOrders && Number(config.everyOrdersCount) < 1) {
      issues.push("A recorrência por pedidos precisa ser de pelo menos 1 pedido.");
    }

    if (config.everySpend && Number(config.everySpendValue.replace(",", ".")) <= 0) {
      issues.push("Informe um valor acumulado maior que zero.");
    }

    if (config.schedule && config.weekdays.length === 0) {
      issues.push("Selecione pelo menos um dia para a janela de liberação.");
    }

    if (config.schedule && (!config.startTime || !config.endTime || config.startTime >= config.endTime)) {
      issues.push("Defina um horário final posterior ao horário inicial.");
    }

    if (config.customerLimit && Number(config.maxSpins) < 1) {
      issues.push("O limite por cliente precisa permitir pelo menos 1 giro.");
    }

    return issues;
  }, [config]);

  const releaseSummary = useMemo(() => {
    const rules: string[] = [];

    if (config.afterOrder) rules.push("1 giro após pedido concluído");
    if (config.minimumOrder) {
      rules.push(`pedido mínimo de ${formatMoneyInput(config.minimumOrderValue)}`);
    }
    if (config.everyOrders) {
      rules.push(`a cada ${config.everyOrdersCount || "—"} pedidos`);
    }
    if (config.everySpend) {
      rules.push(`a cada ${formatMoneyInput(config.everySpendValue)} gastos`);
    }
    if (config.firstPurchase) rules.push("na primeira compra");

    return rules;
  }, [config]);

  const selectedDaysLabel = useMemo(() => {
    if (!config.schedule) return "Todos os dias e horários";
    if (config.weekdays.length === 7) return `Todos os dias, ${config.startTime}–${config.endTime}`;
    if (config.weekdays.length === 0) return "Nenhum dia selecionado";

    const labels = WEEKDAYS.filter((day) => config.weekdays.includes(day.value)).map(
      (day) => day.short,
    );
    return `${labels.join(", ")}, ${config.startTime}–${config.endTime}`;
  }, [config]);

  const limitLabel = useMemo(() => {
    if (!config.customerLimit) return "Sem limite adicional por cliente";
    const period =
      config.limitPeriod === "day"
        ? "por dia"
        : config.limitPeriod === "week"
          ? "por semana"
          : "durante a campanha";
    return `${config.maxSpins || "—"} giro(s) ${period}`;
  }, [config]);

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Roleta da Sorte"
        description="Defina quando a campanha acontece e quais comportamentos liberam um giro para o cliente."
        icon={<Gift size={24} />}
        action={
          <div className="flex w-full gap-2 sm:w-auto">
            <AdminButton
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setConfig(DEFAULT_CONFIG);
                setShowValidation(false);
              }}
            >
              <RotateCcw size={16} />
              Restaurar
            </AdminButton>
            <AdminButton
              className="flex-1 sm:flex-none"
              onClick={() => setShowValidation(true)}
            >
              <Check size={16} />
              Validar configuração
            </AdminButton>
          </div>
        }
      />

      <div className="rounded-[22px] border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-800">
        <div className="flex items-start gap-3">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p className="leading-6">
            Nesta frente, a configuração funciona como interface e validação do fluxo. A persistência definitiva e a ativação segura da campanha serão conectadas ao banco na Frente 5.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle
              icon={<Sparkles size={18} />}
              title="Campanha"
              description="Identifique a roleta e defina em qual estado ela deve aparecer na gestão."
            />

            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-700">Nome da campanha</span>
                <AdminInput
                  value={config.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="Ex.: Roleta de Setembro"
                  maxLength={80}
                />
                <span className="mt-1.5 block text-xs text-gray-400">{config.name.length}/80 caracteres</span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-700">Status</span>
                <AdminSelect
                  value={config.status}
                  onChange={(event) => update("status", event.target.value as CampaignStatus)}
                >
                  <option value="draft">Rascunho</option>
                  <option value="scheduled">Agendada</option>
                  <option value="active">Ativa</option>
                  <option value="paused">Pausada</option>
                </AdminSelect>
              </label>
            </div>
          </section>

          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle
              icon={<CalendarDays size={18} />}
              title="Período da campanha"
              description="Defina a janela em que a campanha poderá gerar novos giros."
            />

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-700">Início</span>
                <AdminInput
                  type="datetime-local"
                  value={config.startsAt}
                  onChange={(event) => update("startsAt", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-700">Fim</span>
                <AdminInput
                  type="datetime-local"
                  value={config.endsAt}
                  onChange={(event) => update("endsAt", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle
              icon={<Target size={18} />}
              title="Regras de liberação do giro"
              description="Combine critérios. O cliente recebe um giro quando cumprir uma das regras ativas dentro do período permitido."
            />

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <RuleCard
                icon={<ShoppingBag size={18} />}
                title="Após um pedido"
                description="Libera um giro sempre que um pedido elegível for concluído."
                enabled={config.afterOrder}
                onToggle={() => toggleRule("afterOrder")}
              />

              <RuleCard
                icon={<Coins size={18} />}
                title="Pedido mínimo"
                description="Só libera o giro quando o pedido atingir um valor mínimo."
                enabled={config.minimumOrder}
                onToggle={() => toggleRule("minimumOrder")}
              >
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">
                    Valor mínimo do pedido
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-gray-400">R$</span>
                    <AdminInput
                      className="pl-11"
                      inputMode="decimal"
                      value={config.minimumOrderValue}
                      onChange={(event) => update("minimumOrderValue", event.target.value)}
                      placeholder="50,00"
                    />
                  </div>
                </label>
              </RuleCard>

              <RuleCard
                icon={<ShoppingBag size={18} />}
                title="A cada X pedidos"
                description="Recompensa recorrência após uma quantidade acumulada de compras."
                enabled={config.everyOrders}
                onToggle={() => toggleRule("everyOrders")}
              >
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">
                    Quantidade de pedidos
                  </span>
                  <div className="flex items-center gap-3">
                    <AdminInput
                      type="number"
                      min={1}
                      max={999}
                      value={config.everyOrdersCount}
                      onChange={(event) => update("everyOrdersCount", event.target.value)}
                      className="max-w-32"
                    />
                    <span className="text-sm text-gray-500">pedidos = 1 giro</span>
                  </div>
                </label>
              </RuleCard>

              <RuleCard
                icon={<Coins size={18} />}
                title="A cada R$ X gastos"
                description="Libera novos giros conforme o cliente acumula valor em compras."
                enabled={config.everySpend}
                onToggle={() => toggleRule("everySpend")}
              >
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">
                    Valor acumulado
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-gray-400">R$</span>
                    <AdminInput
                      className="pl-11"
                      inputMode="decimal"
                      value={config.everySpendValue}
                      onChange={(event) => update("everySpendValue", event.target.value)}
                      placeholder="100,00"
                    />
                  </div>
                </label>
              </RuleCard>

              <RuleCard
                icon={<UserRoundCheck size={18} />}
                title="Primeira compra"
                description="Oferece um giro de boas-vindas apenas no primeiro pedido do cliente."
                enabled={config.firstPurchase}
                onToggle={() => toggleRule("firstPurchase")}
              />
            </div>
          </section>

          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle
              icon={<Clock3 size={18} />}
              title="Dias e horários específicos"
              description="Restrinja a liberação de giros a dias e faixas de horário estratégicas."
            />

            <div className="mt-5">
              <RuleCard
                icon={<Clock3 size={18} />}
                title="Usar janela de liberação"
                description="Fora dessa janela, pedidos não geram novos giros mesmo que cumpram uma regra."
                enabled={config.schedule}
                onToggle={() => toggleRule("schedule")}
              >
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Dias permitidos</p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const selected = config.weekdays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          aria-pressed={selected}
                          aria-label={day.label}
                          onClick={() => toggleWeekday(day.value)}
                          className={`min-h-10 min-w-12 rounded-xl border px-3 text-sm font-bold transition-colors ${
                            selected
                              ? "border-orange-300 bg-[var(--brand-soft)] text-[var(--brand)]"
                              : "border-[var(--line)] bg-white text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Das</span>
                    <AdminInput
                      type="time"
                      value={config.startTime}
                      onChange={(event) => update("startTime", event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Até</span>
                    <AdminInput
                      type="time"
                      value={config.endTime}
                      onChange={(event) => update("endTime", event.target.value)}
                    />
                  </label>
                </div>
              </RuleCard>
            </div>
          </section>

          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle
              icon={<Users size={18} />}
              title="Limite por cliente"
              description="Controle quantos giros uma mesma pessoa pode receber, independentemente das regras cumpridas."
            />

            <div className="mt-5">
              <RuleCard
                icon={<Users size={18} />}
                title="Limitar giros por cliente"
                description="Evita concentração de giros e ajuda a controlar o custo promocional da campanha."
                enabled={config.customerLimit}
                onToggle={() => toggleRule("customerLimit")}
              >
                <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Máximo de giros</span>
                    <AdminInput
                      type="number"
                      min={1}
                      max={999}
                      value={config.maxSpins}
                      onChange={(event) => update("maxSpins", event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Período do limite</span>
                    <AdminSelect
                      value={config.limitPeriod}
                      onChange={(event) => update("limitPeriod", event.target.value as WheelConfig["limitPeriod"])}
                    >
                      <option value="day">Por dia</option>
                      <option value="week">Por semana</option>
                      <option value="campaign">Durante toda a campanha</option>
                    </AdminSelect>
                  </label>
                </div>
              </RuleCard>
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Resumo</p>
                <h2 className="mt-2 text-lg font-black text-gray-950">
                  {config.name.trim() || "Nova campanha"}
                </h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_CLASSES[config.status]}`}>
                {STATUS_LABELS[config.status]}
              </span>
            </div>

            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="font-bold text-gray-400">Período</dt>
                <dd className="mt-1 leading-5 text-gray-700">
                  {config.startsAt && config.endsAt
                    ? `${new Date(config.startsAt).toLocaleString("pt-BR")} até ${new Date(config.endsAt).toLocaleString("pt-BR")}`
                    : "Defina início e fim"}
                </dd>
              </div>

              <div>
                <dt className="font-bold text-gray-400">Liberação</dt>
                <dd className="mt-1 text-gray-700">
                  {releaseSummary.length ? (
                    <ul className="space-y-1.5">
                      {releaseSummary.map((rule) => (
                        <li key={rule} className="flex items-start gap-2 leading-5">
                          <Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "Nenhuma regra ativa"
                  )}
                </dd>
              </div>

              <div>
                <dt className="font-bold text-gray-400">Janela permitida</dt>
                <dd className="mt-1 leading-5 text-gray-700">{selectedDaysLabel}</dd>
              </div>

              <div>
                <dt className="font-bold text-gray-400">Limite</dt>
                <dd className="mt-1 leading-5 text-gray-700">{limitLabel}</dd>
              </div>
            </dl>
          </section>

          {showValidation ? (
            <section
              className={`rounded-[24px] border p-5 ${
                errors.length
                  ? "border-red-200 bg-red-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
              aria-live="polite"
            >
              {errors.length ? (
                <>
                  <p className="font-black text-red-800">Revise a configuração</p>
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
                    <p className="font-black text-emerald-800">Configuração válida</p>
                    <p className="mt-1 text-sm leading-5 text-emerald-700">
                      As regras desta etapa estão consistentes. Na próxima frente entraremos com prêmios e distribuição.
                    </p>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className="rounded-[24px] border border-dashed border-orange-200 bg-[#fffaf6] p-5">
            <p className="text-sm font-black text-gray-950">Próxima etapa</p>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              A Frente 4 adicionará os prêmios e os modos de distribuição por probabilidade ou frequência, usando esta campanha como base.
            </p>
          </section>
        </aside>
      </div>
    </AdminPageShell>
  );
}
