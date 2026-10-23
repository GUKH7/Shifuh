"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Coins,
  Loader2,
  Save,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import {
  AdminButton,
  AdminInput,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
} from "@/components/ui/admin-primitives";
import {
  AdminErrorState,
  AdminPageSkeleton,
} from "@/components/ui/admin-page-states";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

type LoyaltyStatus = "draft" | "active" | "paused";
type EarningMode = "spend" | "order";

type LoyaltyProgramRow = {
  id: string;
  name: string;
  status: LoyaltyStatus;
  earning_mode: EarningMode;
  spend_amount: number | null;
  points_per_spend: number | null;
  points_per_order: number | null;
  minimum_order_amount: number;
  points_validity_days: number | null;
};

type LoyaltyForm = {
  name: string;
  status: LoyaltyStatus;
  earningMode: EarningMode;
  spendAmount: string;
  pointsPerSpend: string;
  pointsPerOrder: string;
  minimumOrderAmount: string;
  pointsExpire: boolean;
  pointsValidityDays: string;
};

const DEFAULT_FORM: LoyaltyForm = {
  name: "Programa de fidelidade",
  status: "draft",
  earningMode: "spend",
  spendAmount: "1,00",
  pointsPerSpend: "1",
  pointsPerOrder: "10",
  minimumOrderAmount: "0,00",
  pointsExpire: false,
  pointsValidityDays: "90",
};

function parseDecimal(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

function formatDecimalInput(value: number | null | undefined, fallback = "0,00") {
  if (value == null || !Number.isFinite(Number(value))) return fallback;
  return Number(value).toFixed(2).replace(".", ",");
}

function statusLabel(status: LoyaltyStatus) {
  if (status === "active") return "Ativo";
  if (status === "paused") return "Pausado";
  return "Rascunho";
}

export default function LoyaltyProgramWorkspace() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [restaurantId, setRestaurantId] = useState("");
  const [programId, setProgramId] = useState<string | null>(null);
  const [form, setForm] = useState<LoyaltyForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let active = true;

    const loadProgram = async () => {
      try {
        const { restaurant, user } = await getCurrentRestaurant(supabase);

        if (!user) {
          router.push("/admin/login");
          return;
        }

        if (!restaurant) {
          if (active) setLoadError("Não foi possível localizar a loja.");
          return;
        }

        if (active) setRestaurantId(restaurant.id);

        const { data, error } = await (supabase as any)
          .from("loyalty_programs")
          .select(
            "id, name, status, earning_mode, spend_amount, points_per_spend, points_per_order, minimum_order_amount, points_validity_days",
          )
          .eq("restaurant_id", restaurant.id)
          .maybeSingle();

        if (error) throw error;
        if (!active || !data) return;

        const program = data as LoyaltyProgramRow;
        setProgramId(program.id);
        setForm({
          name: program.name,
          status: program.status,
          earningMode: program.earning_mode,
          spendAmount: formatDecimalInput(program.spend_amount, "1,00"),
          pointsPerSpend: String(program.points_per_spend || 1),
          pointsPerOrder: String(program.points_per_order || 10),
          minimumOrderAmount: formatDecimalInput(program.minimum_order_amount),
          pointsExpire: program.points_validity_days != null,
          pointsValidityDays: String(program.points_validity_days || 90),
        });
      } catch (error) {
        console.error(error);
        if (active) setLoadError("Erro ao carregar a configuração do programa de fidelidade.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadProgram();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  const earningSummary = useMemo(() => {
    if (form.earningMode === "order") {
      const points = Number(form.pointsPerOrder || 0);
      return `${Number.isFinite(points) && points > 0 ? points : 0} ponto(s) por pedido concluído`;
    }

    const amount = parseDecimal(form.spendAmount);
    const points = Number(form.pointsPerSpend || 0);
    const amountLabel = Number.isFinite(amount) && amount > 0
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)
      : "R$ 0,00";
    return `${Number.isFinite(points) && points > 0 ? points : 0} ponto(s) a cada ${amountLabel}`;
  }, [form.earningMode, form.pointsPerOrder, form.pointsPerSpend, form.spendAmount]);

  const updateForm = <K extends keyof LoyaltyForm>(key: K, value: LoyaltyForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  const handleSave = async () => {
    setFeedback(null);

    const name = form.name.trim();
    if (name.length < 3 || name.length > 80) {
      setFeedback({ type: "error", message: "O nome do programa deve ter entre 3 e 80 caracteres." });
      return;
    }

    const minimumOrderAmount = parseDecimal(form.minimumOrderAmount);
    if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) {
      setFeedback({ type: "error", message: "Informe um pedido mínimo válido, igual ou maior que R$ 0,00." });
      return;
    }

    let spendAmount: number | null = null;
    let pointsPerSpend: number | null = null;
    let pointsPerOrder: number | null = null;

    if (form.earningMode === "spend") {
      spendAmount = parseDecimal(form.spendAmount);
      pointsPerSpend = Number(form.pointsPerSpend);
      if (!Number.isFinite(spendAmount) || spendAmount <= 0) {
        setFeedback({ type: "error", message: "O valor-base para acumular pontos deve ser maior que zero." });
        return;
      }
      if (!Number.isInteger(pointsPerSpend) || pointsPerSpend <= 0) {
        setFeedback({ type: "error", message: "Os pontos por valor gasto devem ser um número inteiro maior que zero." });
        return;
      }
    } else {
      pointsPerOrder = Number(form.pointsPerOrder);
      if (!Number.isInteger(pointsPerOrder) || pointsPerOrder <= 0) {
        setFeedback({ type: "error", message: "Os pontos por pedido devem ser um número inteiro maior que zero." });
        return;
      }
    }

    let pointsValidityDays: number | null = null;
    if (form.pointsExpire) {
      pointsValidityDays = Number(form.pointsValidityDays);
      if (!Number.isInteger(pointsValidityDays) || pointsValidityDays <= 0) {
        setFeedback({ type: "error", message: "A validade dos pontos deve ser informada em dias inteiros maiores que zero." });
        return;
      }
    }

    if (!restaurantId) {
      setFeedback({ type: "error", message: "Não foi possível identificar a loja para salvar o programa." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name,
        status: form.status,
        earning_mode: form.earningMode,
        spend_amount: spendAmount,
        points_per_spend: pointsPerSpend,
        points_per_order: pointsPerOrder,
        minimum_order_amount: minimumOrderAmount,
        points_validity_days: pointsValidityDays,
      };

      const { data, error } = await (supabase as any)
        .from("loyalty_programs")
        .upsert(payload, { onConflict: "restaurant_id" })
        .select("id")
        .single();

      if (error) throw error;
      setProgramId(data.id);
      setFeedback({ type: "success", message: "Configuração do programa salva com sucesso." });
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: "Não foi possível salvar a configuração do programa." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <AdminPageSkeleton ariaLabel="Carregando programa de fidelidade" metrics={3} />;
  }

  if (loadError) return <AdminErrorState description={loadError} />;

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Programa de fidelidade"
        description="Defina como os clientes acumulam pontos e por quanto tempo eles permanecem válidos."
        icon={<Award size={24} />}
        action={
          <AdminButton onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Salvando..." : "Salvar configuração"}
          </AdminButton>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <article className="surface-card rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <BadgeCheck size={18} />
            </span>
            <div>
              <p className="text-xs font-bold text-gray-400">Status</p>
              <p className="mt-1 font-black text-gray-950">{statusLabel(form.status)}</p>
            </div>
          </div>
        </article>

        <article className="surface-card rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <Coins size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-400">Acúmulo</p>
              <p className="mt-1 truncate font-black text-gray-950">{earningSummary}</p>
            </div>
          </div>
        </article>

        <article className="surface-card rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <CalendarClock size={18} />
            </span>
            <div>
              <p className="text-xs font-bold text-gray-400">Validade</p>
              <p className="mt-1 font-black text-gray-950">
                {form.pointsExpire ? `${form.pointsValidityDays || 0} dias` : "Sem expiração"}
              </p>
            </div>
          </div>
        </article>
      </section>

      {feedback ? (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : null}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <section className="surface-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Configuração</p>
            <h2 className="mt-2 text-xl font-black text-gray-950">Regras do programa</h2>
          </div>
          <span className="text-xs font-bold text-gray-400">
            {programId ? "Configuração persistida" : "Ainda não salvo"}
          </span>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">Nome do programa</span>
            <AdminInput
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              maxLength={80}
              placeholder="Ex.: Clube Shifuh"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">Status</span>
            <AdminSelect
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value as LoyaltyStatus)}
            >
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
            </AdminSelect>
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-2 block text-sm font-bold text-gray-700">Forma de acúmulo</span>
            <AdminSelect
              value={form.earningMode}
              onChange={(event) => updateForm("earningMode", event.target.value as EarningMode)}
            >
              <option value="spend">Por valor gasto</option>
              <option value="order">Por pedido concluído</option>
            </AdminSelect>
          </label>

          {form.earningMode === "spend" ? (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-700">A cada valor gasto</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                  <AdminInput
                    className="pl-11"
                    inputMode="decimal"
                    value={form.spendAmount}
                    onChange={(event) => updateForm("spendAmount", event.target.value)}
                    placeholder="1,00"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-700">Pontos concedidos</span>
                <AdminInput
                  type="number"
                  min={1}
                  step={1}
                  value={form.pointsPerSpend}
                  onChange={(event) => updateForm("pointsPerSpend", event.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="block lg:col-span-2">
              <span className="mb-2 block text-sm font-bold text-gray-700">Pontos por pedido concluído</span>
              <AdminInput
                type="number"
                min={1}
                step={1}
                value={form.pointsPerOrder}
                onChange={(event) => updateForm("pointsPerOrder", event.target.value)}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">Pedido mínimo para pontuar</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
              <AdminInput
                className="pl-11"
                inputMode="decimal"
                value={form.minimumOrderAmount}
                onChange={(event) => updateForm("minimumOrderAmount", event.target.value)}
                placeholder="0,00"
              />
            </div>
          </label>

          <div className="rounded-2xl border border-[var(--line)] bg-[#fffdfa] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.pointsExpire}
                onChange={(event) => updateForm("pointsExpire", event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 accent-[var(--brand)]"
              />
              <span>
                <span className="block text-sm font-black text-gray-950">Definir validade dos pontos</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500">
                  Quando desativado, os créditos futuros não expiram automaticamente.
                </span>
              </span>
            </label>

            {form.pointsExpire ? (
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-bold text-gray-500">Validade em dias</span>
                <AdminInput
                  type="number"
                  min={1}
                  step={1}
                  value={form.pointsValidityDays}
                  onChange={(event) => updateForm("pointsValidityDays", event.target.value)}
                />
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-orange-100 bg-[#fff8f3] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={19} className="mt-0.5 shrink-0 text-[var(--brand)]" />
            <div>
              <p className="text-sm font-black text-gray-950">Regra operacional segura</p>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                Quando o programa está ativo, os pontos são creditados automaticamente ao concluir pedidos elegíveis, com proteção contra crédito duplicado.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="surface-card rounded-3xl p-5">
          <ShoppingBag size={20} className="text-[var(--brand)]" />
          <h3 className="mt-4 font-black text-gray-950">Pedidos elegíveis</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            O motor usará pedidos concluídos que respeitem o valor mínimo configurado.
          </p>
        </article>
        <article className="surface-card rounded-3xl p-5">
          <Coins size={20} className="text-[var(--brand)]" />
          <h3 className="mt-4 font-black text-gray-950">Carteira separada</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            O saldo e o extrato de pontos serão próprios da Fidelidade, sem misturar dados com os giros da Roleta.
          </p>
        </article>
        <article className="surface-card rounded-3xl p-5">
          <Sparkles size={20} className="text-[var(--brand)]" />
          <h3 className="mt-4 font-black text-gray-950">Acúmulo automático</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Ao concluir um pedido elegível, o saldo e o extrato do cliente são atualizados automaticamente conforme estas regras.
          </p>
        </article>
      </section>
    </AdminPageShell>
  );
}
