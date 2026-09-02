"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BadgePercent,
  CalendarDays,
  CircleSlash2,
  Clock3,
  Database,
  Gift,
  Loader2,
  Package,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import {
  AdminButton,
  AdminInput,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
} from "@/components/ui/admin-primitives";
import { AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

type CampaignStatus = "draft" | "scheduled" | "active" | "paused";
type DistributionMode = "probability" | "frequency";
type PrizeType = "percent" | "fixed" | "free_shipping" | "free_product" | "no_prize";

type CampaignForm = {
  name: string;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  mode: DistributionMode;
  maxAwardsEnabled: boolean;
  maxAwards: string;
  budgetEnabled: boolean;
  budget: string;
  autoPause: boolean;
};

type RulesForm = {
  completedOrder: boolean;
  minimumOrder: boolean;
  minimumOrderValue: string;
  everyOrders: boolean;
  everyOrdersCount: string;
  spendThreshold: boolean;
  spendThresholdValue: string;
  firstPurchase: boolean;
  schedule: boolean;
  weekdays: number[];
  startTime: string;
  endTime: string;
  customerLimit: boolean;
  maxSpins: string;
  limitPeriod: "day" | "week" | "campaign";
};

type PrizeForm = {
  id: string;
  type: PrizeType;
  label: string;
  value: string;
  productId: string;
  probability: string;
  frequency: string;
  quantityLimitEnabled: boolean;
  quantityLimit: string;
  customerLimitEnabled: boolean;
  customerLimit: string;
  validityDays: string;
};

type ProductOption = { id: string; name: string };

type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus | "ended";
  starts_at: string;
  ends_at: string;
  distribution_mode: DistributionMode;
  max_awards: number | null;
  budget_limit: number | null;
  auto_pause_on_limit: boolean;
};

type RuleRow = {
  rule_type: string;
  enabled: boolean;
  threshold_amount: number | null;
  threshold_count: number | null;
  weekdays: number[] | null;
  start_time: string | null;
  end_time: string | null;
  max_spins: number | null;
  limit_period: RulesForm["limitPeriod"] | null;
};

type PrizeRow = {
  id: string;
  prize_type: PrizeType;
  label: string;
  percentage_value: number | null;
  fixed_amount: number | null;
  product_id: string | null;
  probability: number | null;
  frequency_every: number | null;
  quantity_limit: number | null;
  per_customer_limit: number | null;
  reward_validity_minutes: number | null;
};

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const PRIZE_META: Record<PrizeType, { label: string; icon: typeof Gift }> = {
  percent: { label: "Desconto percentual", icon: BadgePercent },
  fixed: { label: "Desconto fixo", icon: Wallet },
  free_shipping: { label: "Frete grátis", icon: Truck },
  free_product: { label: "Produto grátis", icon: Package },
  no_prize: { label: "Não foi dessa vez", icon: CircleSlash2 },
};

function toLocalDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function initialCampaign(): CampaignForm {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    name: "Roleta da Sorte",
    status: "draft",
    startsAt: toLocalDateTime(now),
    endsAt: toLocalDateTime(end),
    mode: "probability",
    maxAwardsEnabled: true,
    maxAwards: "500",
    budgetEnabled: false,
    budget: "1000",
    autoPause: true,
  };
}

const DEFAULT_RULES: RulesForm = {
  completedOrder: true,
  minimumOrder: false,
  minimumOrderValue: "50",
  everyOrders: false,
  everyOrdersCount: "3",
  spendThreshold: false,
  spendThresholdValue: "100",
  firstPurchase: false,
  schedule: false,
  weekdays: [1, 2, 3, 4, 5, 6, 0],
  startTime: "11:00",
  endTime: "23:00",
  customerLimit: true,
  maxSpins: "2",
  limitPeriod: "week",
};

function makePrize(type: PrizeType, seed?: Partial<PrizeForm>): PrizeForm {
  return {
    id: seed?.id || crypto.randomUUID(),
    type,
    label: seed?.label || PRIZE_META[type].label,
    value: seed?.value ?? (type === "percent" ? "10" : type === "fixed" ? "5" : ""),
    productId: seed?.productId || "",
    probability: seed?.probability ?? (type === "no_prize" ? "50" : "10"),
    frequency: seed?.frequency ?? (type === "no_prize" ? "" : "10"),
    quantityLimitEnabled: seed?.quantityLimitEnabled ?? false,
    quantityLimit: seed?.quantityLimit || "100",
    customerLimitEnabled: seed?.customerLimitEnabled ?? type !== "no_prize",
    customerLimit: seed?.customerLimit || "1",
    validityDays: seed?.validityDays || "30",
  };
}

function defaultPrizes() {
  return [
    makePrize("percent", { label: "10% de desconto", probability: "25" }),
    makePrize("fixed", { label: "R$ 5 de desconto", probability: "15" }),
    makePrize("free_shipping", { label: "Frete grátis", probability: "10" }),
    makePrize("no_prize", { label: "Não foi dessa vez", probability: "50" }),
  ];
}

function parseNumber(value: string) {
  return Number(value.replace(",", "."));
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? "border-orange-300 bg-[var(--brand)]" : "border-gray-200 bg-gray-100"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function RuleBox({ title, description, enabled, onToggle, children }: { title: string; description: string; enabled: boolean; onToggle: () => void; children?: ReactNode }) {
  return (
    <article className={`rounded-[22px] border p-4 ${enabled ? "border-orange-200 bg-[#fffaf6]" : "border-[var(--line)] bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-black text-gray-950">{title}</p><p className="mt-1 text-sm leading-5 text-gray-500">{description}</p></div>
        <Toggle checked={enabled} onChange={onToggle} label={title} />
      </div>
      {enabled && children ? <div className="mt-4 border-t border-orange-100 pt-4">{children}</div> : null}
    </article>
  );
}

export default function WheelCampaignWorkspace() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), []);

  const [restaurantId, setRestaurantId] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignForm>(() => initialCampaign());
  const [rules, setRules] = useState<RulesForm>(DEFAULT_RULES);
  const [prizes, setPrizes] = useState<PrizeForm[]>(() => defaultPrizes());
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user) {
        router.push("/admin/login");
        return;
      }
      if (!restaurant) throw new Error("Não foi possível localizar a loja.");
      setRestaurantId(restaurant.id);

      const [campaignResult, productsResult] = await Promise.all([
        (supabase as any)
          .from("promotion_campaigns")
          .select("id, name, status, starts_at, ends_at, distribution_mode, max_awards, budget_limit, auto_pause_on_limit")
          .eq("restaurant_id", restaurant.id)
          .eq("kind", "roulette")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from("products")
          .select("id, name")
          .eq("restaurant_id", restaurant.id)
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      if (campaignResult.error) throw campaignResult.error;
      if (productsResult.error) throw productsResult.error;
      setProducts((productsResult.data || []) as ProductOption[]);

      const current = campaignResult.data as CampaignRow | null;
      if (!current) {
        setCampaignId(null);
        setCampaign(initialCampaign());
        setRules(DEFAULT_RULES);
        setPrizes(defaultPrizes());
        return;
      }

      const [rulesResult, prizesResult] = await Promise.all([
        (supabase as any).from("promotion_eligibility_rules").select("rule_type, enabled, threshold_amount, threshold_count, weekdays, start_time, end_time, max_spins, limit_period").eq("restaurant_id", restaurant.id).eq("campaign_id", current.id),
        (supabase as any).from("promotion_prizes").select("id, prize_type, label, percentage_value, fixed_amount, product_id, probability, frequency_every, quantity_limit, per_customer_limit, reward_validity_minutes").eq("restaurant_id", restaurant.id).eq("campaign_id", current.id).eq("active", true).order("sort_order", { ascending: true }),
      ]);
      if (rulesResult.error) throw rulesResult.error;
      if (prizesResult.error) throw prizesResult.error;

      setCampaignId(current.id);
      setCampaign({
        name: current.name,
        status: current.status === "ended" ? "paused" : current.status,
        startsAt: toLocalDateTime(current.starts_at),
        endsAt: toLocalDateTime(current.ends_at),
        mode: current.distribution_mode,
        maxAwardsEnabled: current.max_awards !== null,
        maxAwards: current.max_awards ? String(current.max_awards) : "500",
        budgetEnabled: current.budget_limit !== null,
        budget: current.budget_limit ? String(current.budget_limit) : "1000",
        autoPause: current.auto_pause_on_limit,
      });

      const nextRules = { ...DEFAULT_RULES, weekdays: [...DEFAULT_RULES.weekdays] };
      ((rulesResult.data || []) as RuleRow[]).forEach((rule) => {
        if (!rule.enabled) return;
        if (rule.rule_type === "completed_order") nextRules.completedOrder = true;
        if (rule.rule_type === "minimum_order") { nextRules.minimumOrder = true; nextRules.minimumOrderValue = String(rule.threshold_amount || 50); }
        if (rule.rule_type === "every_orders") { nextRules.everyOrders = true; nextRules.everyOrdersCount = String(rule.threshold_count || 3); }
        if (rule.rule_type === "spend_threshold") { nextRules.spendThreshold = true; nextRules.spendThresholdValue = String(rule.threshold_amount || 100); }
        if (rule.rule_type === "first_purchase") nextRules.firstPurchase = true;
        if (rule.rule_type === "schedule") {
          nextRules.schedule = true;
          nextRules.weekdays = rule.weekdays || nextRules.weekdays;
          nextRules.startTime = (rule.start_time || "11:00").slice(0, 5);
          nextRules.endTime = (rule.end_time || "23:00").slice(0, 5);
        }
        if (rule.rule_type === "customer_spin_limit") {
          nextRules.customerLimit = true;
          nextRules.maxSpins = String(rule.max_spins || 2);
          nextRules.limitPeriod = rule.limit_period || "week";
        }
      });
      const loadedTypes = new Set(((rulesResult.data || []) as RuleRow[]).filter((item) => item.enabled).map((item) => item.rule_type));
      nextRules.completedOrder = loadedTypes.has("completed_order");
      nextRules.minimumOrder = loadedTypes.has("minimum_order");
      nextRules.everyOrders = loadedTypes.has("every_orders");
      nextRules.spendThreshold = loadedTypes.has("spend_threshold");
      nextRules.firstPurchase = loadedTypes.has("first_purchase");
      nextRules.schedule = loadedTypes.has("schedule");
      nextRules.customerLimit = loadedTypes.has("customer_spin_limit");
      setRules(nextRules);

      const loadedPrizes = ((prizesResult.data || []) as PrizeRow[]).map((prize) => makePrize(prize.prize_type, {
        id: prize.id,
        label: prize.label,
        value: prize.prize_type === "percent" ? String(prize.percentage_value || "") : prize.prize_type === "fixed" ? String(prize.fixed_amount || "") : "",
        productId: prize.product_id || "",
        probability: prize.probability === null ? "" : String(prize.probability),
        frequency: prize.frequency_every === null ? "" : String(prize.frequency_every),
        quantityLimitEnabled: prize.quantity_limit !== null,
        quantityLimit: prize.quantity_limit === null ? "100" : String(prize.quantity_limit),
        customerLimitEnabled: prize.per_customer_limit !== null,
        customerLimit: prize.per_customer_limit === null ? "1" : String(prize.per_customer_limit),
        validityDays: prize.reward_validity_minutes ? String(Math.max(1, Math.round(prize.reward_validity_minutes / 1440))) : "30",
      }));
      setPrizes(loadedPrizes.length ? loadedPrizes : defaultPrizes());
    } catch (error) {
      console.error(error);
      setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar a configuração da roleta.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (campaign.name.trim().length < 3) errors.push("Informe um nome de campanha com pelo menos 3 caracteres.");
    if (!campaign.startsAt || !campaign.endsAt || new Date(campaign.endsAt) <= new Date(campaign.startsAt)) errors.push("Defina um período válido para a campanha.");
    if (![rules.completedOrder, rules.minimumOrder, rules.everyOrders, rules.spendThreshold, rules.firstPurchase].some(Boolean)) errors.push("Ative pelo menos uma regra de liberação do giro.");
    if (rules.minimumOrder && parseNumber(rules.minimumOrderValue) <= 0) errors.push("O pedido mínimo precisa ser maior que zero.");
    if (rules.everyOrders && parseNumber(rules.everyOrdersCount) < 1) errors.push("A recorrência de pedidos precisa ser de pelo menos 1.");
    if (rules.spendThreshold && parseNumber(rules.spendThresholdValue) <= 0) errors.push("O valor acumulado precisa ser maior que zero.");
    if (rules.schedule && (!rules.weekdays.length || !rules.startTime || !rules.endTime || rules.startTime >= rules.endTime)) errors.push("Revise os dias e horários permitidos.");
    if (rules.customerLimit && parseNumber(rules.maxSpins) < 1) errors.push("O limite por cliente precisa ser de pelo menos 1 giro.");
    if (prizes.length < 2) errors.push("Adicione pelo menos dois resultados à roleta.");
    if (!prizes.some((prize) => prize.type !== "no_prize")) errors.push("Adicione pelo menos um prêmio real.");
    if (prizes.filter((prize) => prize.type === "no_prize").length > 1) errors.push("Use no máximo um resultado “Não foi dessa vez”.");

    prizes.forEach((prize, index) => {
      const prefix = `Resultado ${index + 1}`;
      if (prize.label.trim().length < 2) errors.push(`${prefix}: informe um nome.`);
      if (prize.type === "percent" && (parseNumber(prize.value) <= 0 || parseNumber(prize.value) > 100)) errors.push(`${prefix}: o percentual deve ficar entre 0 e 100%.`);
      if (prize.type === "fixed" && parseNumber(prize.value) <= 0) errors.push(`${prefix}: informe um desconto maior que zero.`);
      if (prize.type === "free_product" && !prize.productId) errors.push(`${prefix}: selecione um produto real do cardápio.`);
      if (prize.type !== "no_prize" && parseNumber(prize.validityDays) < 1) errors.push(`${prefix}: a validade precisa ser de pelo menos 1 dia.`);
      if (prize.quantityLimitEnabled && parseNumber(prize.quantityLimit) < 1) errors.push(`${prefix}: o limite total precisa ser positivo.`);
      if (prize.customerLimitEnabled && parseNumber(prize.customerLimit) < 1) errors.push(`${prefix}: o limite por cliente precisa ser positivo.`);
    });

    if (campaign.mode === "probability") {
      const total = prizes.reduce((sum, prize) => sum + Math.max(0, parseNumber(prize.probability) || 0), 0);
      if (Math.abs(total - 100) > 0.001) errors.push(`As probabilidades precisam somar 100%. Total atual: ${total.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%.`);
      if (prizes.some((prize) => parseNumber(prize.probability) <= 0)) errors.push("Todos os resultados precisam ter probabilidade maior que zero.");
    } else {
      const chance = prizes.filter((prize) => prize.type !== "no_prize").reduce((sum, prize) => {
        const frequency = parseNumber(prize.frequency);
        return sum + (frequency > 0 ? 100 / frequency : 0);
      }, 0);
      if (prizes.some((prize) => prize.type !== "no_prize" && parseNumber(prize.frequency) < 1)) errors.push("Todo prêmio real precisa ter uma frequência válida.");
      if (chance > 100.001) errors.push("As frequências configuradas ultrapassam 100% dos giros.");
      if (chance < 99.999 && !prizes.some((prize) => prize.type === "no_prize")) errors.push("Adicione “Não foi dessa vez” para preencher os giros restantes.");
    }
    return errors;
  }, [campaign, prizes, rules]);

  const saveCampaign = async () => {
    if (validationErrors.length || !restaurantId) {
      setNotice("");
      setErrorMsg(validationErrors[0] || "Loja não localizada.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    setNotice("");
    try {
      const rulesPayload = [
        rules.completedOrder ? { rule_type: "completed_order", enabled: true } : null,
        rules.minimumOrder ? { rule_type: "minimum_order", enabled: true, threshold_amount: parseNumber(rules.minimumOrderValue) } : null,
        rules.everyOrders ? { rule_type: "every_orders", enabled: true, threshold_count: Math.floor(parseNumber(rules.everyOrdersCount)) } : null,
        rules.spendThreshold ? { rule_type: "spend_threshold", enabled: true, threshold_amount: parseNumber(rules.spendThresholdValue) } : null,
        rules.firstPurchase ? { rule_type: "first_purchase", enabled: true } : null,
        rules.schedule ? { rule_type: "schedule", enabled: true, weekdays: rules.weekdays, start_time: rules.startTime, end_time: rules.endTime } : null,
        rules.customerLimit ? { rule_type: "customer_spin_limit", enabled: true, max_spins: Math.floor(parseNumber(rules.maxSpins)), limit_period: rules.limitPeriod } : null,
      ].filter(Boolean);

      const prizesPayload = prizes.map((prize, index) => ({
        id: prize.id,
        prize_type: prize.type,
        label: prize.label.trim(),
        percentage_value: prize.type === "percent" ? parseNumber(prize.value) : null,
        fixed_amount: prize.type === "fixed" ? parseNumber(prize.value) : null,
        product_id: prize.type === "free_product" ? prize.productId : null,
        probability: campaign.mode === "probability" ? parseNumber(prize.probability) : null,
        frequency_every: campaign.mode === "frequency" && prize.type !== "no_prize" ? Math.floor(parseNumber(prize.frequency)) : null,
        quantity_limit: prize.type !== "no_prize" && prize.quantityLimitEnabled ? Math.floor(parseNumber(prize.quantityLimit)) : null,
        per_customer_limit: prize.type !== "no_prize" && prize.customerLimitEnabled ? Math.floor(parseNumber(prize.customerLimit)) : null,
        reward_validity_minutes: prize.type !== "no_prize" ? Math.floor(parseNumber(prize.validityDays) * 1440) : null,
        active: true,
        sort_order: index,
      }));

      const { data, error } = await (supabase as any).rpc("save_promotion_wheel_campaign", {
        p_campaign_id: campaignId,
        p_restaurant_id: restaurantId,
        p_campaign: {
          name: campaign.name.trim(),
          status: campaign.status,
          starts_at: new Date(campaign.startsAt).toISOString(),
          ends_at: new Date(campaign.endsAt).toISOString(),
          distribution_mode: campaign.mode,
          max_awards: campaign.maxAwardsEnabled ? Math.floor(parseNumber(campaign.maxAwards)) : null,
          budget_limit: campaign.budgetEnabled ? parseNumber(campaign.budget) : null,
          auto_pause_on_limit: campaign.autoPause,
        },
        p_rules: rulesPayload,
        p_prizes: prizesPayload,
      });
      if (error) throw error;
      setCampaignId(String(data));
      setNotice(campaign.status === "active" ? "Roleta salva e publicada na vitrine." : "Configuração salva com sucesso.");
      await loadWorkspace();
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error?.message || "Não foi possível salvar a Roleta da Sorte.");
    } finally {
      setSaving(false);
    }
  };

  const updatePrize = (id: string, patch: Partial<PrizeForm>) => setPrizes((current) => current.map((prize) => prize.id === id ? { ...prize, ...patch } : prize));

  if (loading) return <AdminPageSkeleton />;
  if (errorMsg && !restaurantId) return <AdminErrorState message={errorMsg} onRetry={() => void loadWorkspace()} />;

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Roleta da Sorte"
        description="Configure, salve e publique uma campanha real na vitrine. O resultado de cada giro continua decidido exclusivamente no servidor."
        icon={<Gift size={24} />}
        action={<AdminButton onClick={() => void saveCampaign()} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{campaign.status === "active" ? "Salvar e publicar" : "Salvar configuração"}</AdminButton>}
      />

      <section className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
        <div className="flex items-start gap-3"><Database size={18} className="mt-0.5 shrink-0" /><p className="leading-6"><strong>Persistência conectada.</strong> Campanha, regras e prêmios são gravados em uma única transação no Supabase, com RLS por restaurante.</p></div>
      </section>

      {notice ? <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800" role="status">{notice}</div> : null}
      {errorMsg ? <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><strong>Revise a configuração.</strong> {errorMsg}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle icon={<Sparkles size={18} />} title="Campanha" description="Defina identificação, período e estado de publicação da roleta." />
            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label><span className="mb-2 block text-sm font-bold text-gray-700">Nome</span><AdminInput value={campaign.name} maxLength={80} onChange={(event) => setCampaign((current) => ({ ...current, name: event.target.value }))} /></label>
              <label><span className="mb-2 block text-sm font-bold text-gray-700">Status</span><AdminSelect value={campaign.status} onChange={(event) => setCampaign((current) => ({ ...current, status: event.target.value as CampaignStatus }))}><option value="draft">Rascunho</option><option value="scheduled">Agendada</option><option value="active">Ativa</option><option value="paused">Pausada</option></AdminSelect></label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label><span className="mb-2 block text-sm font-bold text-gray-700">Início</span><AdminInput type="datetime-local" value={campaign.startsAt} onChange={(event) => setCampaign((current) => ({ ...current, startsAt: event.target.value }))} /></label>
              <label><span className="mb-2 block text-sm font-bold text-gray-700">Fim</span><AdminInput type="datetime-local" value={campaign.endsAt} onChange={(event) => setCampaign((current) => ({ ...current, endsAt: event.target.value }))} /></label>
            </div>
          </section>

          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle icon={<Target size={18} />} title="Quando liberar um giro" description="As regras abaixo são alternativas: cumprir qualquer uma libera o giro. Horário e limite por cliente funcionam como restrições adicionais." />
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <RuleBox title="Após um pedido" description="Qualquer pedido válido pode liberar um giro." enabled={rules.completedOrder} onToggle={() => setRules((current) => ({ ...current, completedOrder: !current.completedOrder }))} />
              <RuleBox title="Pedido mínimo" description="Libera quando o pedido atingir o valor definido." enabled={rules.minimumOrder} onToggle={() => setRules((current) => ({ ...current, minimumOrder: !current.minimumOrder }))}><AdminInput inputMode="decimal" value={rules.minimumOrderValue} onChange={(event) => setRules((current) => ({ ...current, minimumOrderValue: event.target.value }))} /></RuleBox>
              <RuleBox title="A cada X pedidos" description="Recompensa recorrência por quantidade de compras." enabled={rules.everyOrders} onToggle={() => setRules((current) => ({ ...current, everyOrders: !current.everyOrders }))}><AdminInput type="number" min={1} value={rules.everyOrdersCount} onChange={(event) => setRules((current) => ({ ...current, everyOrdersCount: event.target.value }))} /></RuleBox>
              <RuleBox title="A cada R$ X gastos" description="Libera quando o acumulado cruza um novo patamar." enabled={rules.spendThreshold} onToggle={() => setRules((current) => ({ ...current, spendThreshold: !current.spendThreshold }))}><AdminInput inputMode="decimal" value={rules.spendThresholdValue} onChange={(event) => setRules((current) => ({ ...current, spendThresholdValue: event.target.value }))} /></RuleBox>
              <RuleBox title="Primeira compra" description="Giro de boas-vindas para o primeiro pedido." enabled={rules.firstPurchase} onToggle={() => setRules((current) => ({ ...current, firstPurchase: !current.firstPurchase }))} />
            </div>
          </section>

          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle icon={<Clock3 size={18} />} title="Restrições" description="Aplique uma janela de horário e um teto de giros por cliente." />
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <RuleBox title="Dias e horários" description="Fora desta janela nenhuma regra libera giro." enabled={rules.schedule} onToggle={() => setRules((current) => ({ ...current, schedule: !current.schedule }))}>
                <div className="flex flex-wrap gap-2">{WEEKDAYS.map((day) => <button key={day.value} type="button" onClick={() => setRules((current) => ({ ...current, weekdays: current.weekdays.includes(day.value) ? current.weekdays.filter((item) => item !== day.value) : [...current.weekdays, day.value] }))} className={`rounded-xl border px-3 py-2 text-sm font-bold ${rules.weekdays.includes(day.value) ? "border-orange-300 bg-white text-[var(--brand)]" : "border-gray-200 text-gray-500"}`}>{day.label}</button>)}</div>
                <div className="mt-3 grid grid-cols-2 gap-3"><AdminInput type="time" value={rules.startTime} onChange={(event) => setRules((current) => ({ ...current, startTime: event.target.value }))} /><AdminInput type="time" value={rules.endTime} onChange={(event) => setRules((current) => ({ ...current, endTime: event.target.value }))} /></div>
              </RuleBox>
              <RuleBox title="Limite por cliente" description="Controla quantos giros a mesma pessoa pode receber." enabled={rules.customerLimit} onToggle={() => setRules((current) => ({ ...current, customerLimit: !current.customerLimit }))}>
                <div className="grid gap-3 sm:grid-cols-2"><AdminInput type="number" min={1} value={rules.maxSpins} onChange={(event) => setRules((current) => ({ ...current, maxSpins: event.target.value }))} /><AdminSelect value={rules.limitPeriod} onChange={(event) => setRules((current) => ({ ...current, limitPeriod: event.target.value as RulesForm["limitPeriod"] }))}><option value="day">Por dia</option><option value="week">Por semana</option><option value="campaign">Na campanha</option></AdminSelect></div>
              </RuleBox>
            </div>
          </section>

          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><SectionTitle icon={<Gift size={18} />} title="Prêmios" description="Os segmentos são visuais; probabilidades e frequências ficam protegidas no servidor." /><AdminSelect className="sm:w-56" value={campaign.mode} onChange={(event) => setCampaign((current) => ({ ...current, mode: event.target.value as DistributionMode }))}><option value="probability">Probabilidade (%)</option><option value="frequency">1 a cada X giros</option></AdminSelect></div>
            <div className="mt-5 space-y-3">
              {prizes.map((prize, index) => {
                const Icon = PRIZE_META[prize.type].icon;
                return <article key={prize.id} className="rounded-[24px] border border-[var(--line)] bg-white p-4 sm:p-5">
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]"><Icon size={18} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-gray-950">Resultado {index + 1}</p><AdminButton variant="ghost" className="min-h-9 px-2 text-red-600" onClick={() => setPrizes((current) => current.filter((item) => item.id !== prize.id))}><Trash2 size={15} />Remover</AdminButton></div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label><span className="mb-1.5 block text-xs font-bold uppercase text-gray-500">Tipo</span><AdminSelect value={prize.type} onChange={(event) => { const nextType = event.target.value as PrizeType; updatePrize(prize.id, { type: nextType, label: PRIZE_META[nextType].label, productId: "", value: nextType === "percent" ? "10" : nextType === "fixed" ? "5" : "" }); }}><option value="percent">Desconto percentual</option><option value="fixed">Desconto fixo</option><option value="free_shipping">Frete grátis</option><option value="free_product">Produto grátis</option><option value="no_prize">Não foi dessa vez</option></AdminSelect></label>
                    <label className="md:col-span-1 xl:col-span-2"><span className="mb-1.5 block text-xs font-bold uppercase text-gray-500">Nome exibido</span><AdminInput value={prize.label} onChange={(event) => updatePrize(prize.id, { label: event.target.value })} /></label>
                    {prize.type === "percent" || prize.type === "fixed" ? <label><span className="mb-1.5 block text-xs font-bold uppercase text-gray-500">{prize.type === "percent" ? "Percentual" : "Valor (R$)"}</span><AdminInput inputMode="decimal" value={prize.value} onChange={(event) => updatePrize(prize.id, { value: event.target.value })} /></label> : null}
                    {prize.type === "free_product" ? <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-bold uppercase text-gray-500">Produto do cardápio</span><AdminSelect value={prize.productId} onChange={(event) => updatePrize(prize.id, { productId: event.target.value })}><option value="">Selecione um produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</AdminSelect></label> : null}
                    {campaign.mode === "probability" ? <label><span className="mb-1.5 block text-xs font-bold uppercase text-gray-500">Probabilidade (%)</span><AdminInput type="number" min={0.01} max={100} step="0.01" value={prize.probability} onChange={(event) => updatePrize(prize.id, { probability: event.target.value })} /></label> : prize.type !== "no_prize" ? <label><span className="mb-1.5 block text-xs font-bold uppercase text-gray-500">1 prêmio a cada</span><AdminInput type="number" min={1} value={prize.frequency} onChange={(event) => updatePrize(prize.id, { frequency: event.target.value })} /></label> : null}
                    {prize.type !== "no_prize" ? <label><span className="mb-1.5 block text-xs font-bold uppercase text-gray-500">Validade (dias)</span><AdminInput type="number" min={1} value={prize.validityDays} onChange={(event) => updatePrize(prize.id, { validityDays: event.target.value })} /></label> : null}
                  </div>
                  {prize.type !== "no_prize" ? <div className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"><RuleBox title="Limite total" description="Máximo de unidades distribuídas." enabled={prize.quantityLimitEnabled} onToggle={() => updatePrize(prize.id, { quantityLimitEnabled: !prize.quantityLimitEnabled })}><AdminInput type="number" min={1} value={prize.quantityLimit} onChange={(event) => updatePrize(prize.id, { quantityLimit: event.target.value })} /></RuleBox><RuleBox title="Limite por cliente" description="Máximo deste prêmio para a mesma pessoa." enabled={prize.customerLimitEnabled} onToggle={() => updatePrize(prize.id, { customerLimitEnabled: !prize.customerLimitEnabled })}><AdminInput type="number" min={1} value={prize.customerLimit} onChange={(event) => updatePrize(prize.id, { customerLimit: event.target.value })} /></RuleBox></div> : null}
                  </div></div>
                </article>;
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{(Object.keys(PRIZE_META) as PrizeType[]).map((type) => <AdminButton key={type} variant="secondary" disabled={prizes.length >= 12} onClick={() => setPrizes((current) => [...current, makePrize(type)])}><Plus size={15} />{PRIZE_META[type].label}</AdminButton>)}</div>
          </section>

          <section className="surface-card rounded-[28px] p-5 sm:p-6">
            <SectionTitle icon={<ShieldCheck size={18} />} title="Limites da campanha" description="Controle o volume total de benefícios e o orçamento promocional registrado." />
            <div className="mt-5 grid gap-3 lg:grid-cols-2"><RuleBox title="Máximo de prêmios" description="Limite global de resultados vencedores." enabled={campaign.maxAwardsEnabled} onToggle={() => setCampaign((current) => ({ ...current, maxAwardsEnabled: !current.maxAwardsEnabled }))}><AdminInput type="number" min={1} value={campaign.maxAwards} onChange={(event) => setCampaign((current) => ({ ...current, maxAwards: event.target.value }))} /></RuleBox><RuleBox title="Orçamento promocional" description="Teto financeiro configurado para a campanha." enabled={campaign.budgetEnabled} onToggle={() => setCampaign((current) => ({ ...current, budgetEnabled: !current.budgetEnabled }))}><AdminInput inputMode="decimal" value={campaign.budget} onChange={(event) => setCampaign((current) => ({ ...current, budget: event.target.value }))} /></RuleBox></div>
            <div className="mt-3 flex items-start justify-between gap-4 rounded-[22px] border border-[var(--line)] p-4"><div><p className="font-black text-gray-950">Pausar ao atingir limite</p><p className="mt-1 text-sm text-gray-500">Mantém a trava registrada para o motor promocional.</p></div><Toggle checked={campaign.autoPause} onChange={() => setCampaign((current) => ({ ...current, autoPause: !current.autoPause }))} label="Pausar ao atingir limite" /></div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="surface-card rounded-[28px] p-5"><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Publicação</p><h2 className="mt-2 text-lg font-black text-gray-950">{campaign.name || "Nova campanha"}</h2><dl className="mt-5 space-y-3 text-sm"><div><dt className="font-bold text-gray-400">Estado</dt><dd className="mt-1 font-bold text-gray-800">{campaign.status === "active" ? "Ativa na vitrine" : campaign.status === "scheduled" ? "Agendada" : campaign.status === "paused" ? "Pausada" : "Rascunho"}</dd></div><div><dt className="font-bold text-gray-400">Distribuição</dt><dd className="mt-1 text-gray-700">{campaign.mode === "probability" ? "Probabilidade" : "Frequência controlada"}</dd></div><div><dt className="font-bold text-gray-400">Resultados</dt><dd className="mt-1 text-gray-700">{prizes.length} segmentos</dd></div></dl><AdminButton className="mt-5 w-full" onClick={() => void saveCampaign()} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Salvar agora</AdminButton></section>
          <section className={`rounded-[24px] border p-5 ${validationErrors.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className={`font-black ${validationErrors.length ? "text-amber-800" : "text-emerald-800"}`}>{validationErrors.length ? `${validationErrors.length} ponto(s) para revisar` : "Configuração pronta"}</p>{validationErrors.length ? <ul className="mt-3 space-y-2 text-xs leading-5 text-amber-800">{validationErrors.slice(0, 5).map((error) => <li key={error}>• {error}</li>)}</ul> : <p className="mt-2 text-sm leading-6 text-emerald-700">A campanha pode ser salva com segurança no banco.</p>}</section>
          <section className="rounded-[24px] border border-blue-100 bg-blue-50 p-5"><div className="flex items-start gap-3"><CalendarDays size={18} className="mt-0.5 text-blue-700" /><div><p className="font-black text-blue-900">Resultado protegido</p><p className="mt-1 text-sm leading-6 text-blue-700">A vitrine nunca recebe as probabilidades. O servidor persiste o resultado primeiro e o navegador apenas anima até o prêmio definido.</p></div></div></section>
        </aside>
      </div>
    </AdminPageShell>
  );
}
