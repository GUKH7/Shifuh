"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  Gift,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  AdminButton,
  AdminInput,
  AdminPageShell,
  AdminSelect,
} from "@/components/ui/admin-primitives";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

type RewardType = "percent" | "fixed" | "free_shipping" | "free_product";

type ProgramRow = {
  id: string;
  name: string;
};

type ProductRow = {
  id: string;
  name: string;
};

type RewardRow = {
  id: string;
  name: string;
  description: string | null;
  reward_type: RewardType;
  points_cost: number;
  percentage_value: number | null;
  fixed_amount: number | null;
  product_id: string | null;
  minimum_order_amount: number;
  reward_validity_days: number | null;
  max_redemptions_total: number | null;
  active: boolean;
  sort_order: number;
};

type RewardForm = {
  name: string;
  description: string;
  rewardType: RewardType;
  pointsCost: string;
  percentageValue: string;
  fixedAmount: string;
  productId: string;
  minimumOrderAmount: string;
  rewardValidityDays: string;
  maxRedemptionsTotal: string;
  active: boolean;
};

const DEFAULT_FORM: RewardForm = {
  name: "",
  description: "",
  rewardType: "fixed",
  pointsCost: "100",
  percentageValue: "10",
  fixedAmount: "10,00",
  productId: "",
  minimumOrderAmount: "0,00",
  rewardValidityDays: "30",
  maxRedemptionsTotal: "",
  active: true,
};

function parseDecimal(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatDecimalInput(value: number | null | undefined) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function rewardTypeLabel(type: RewardType) {
  if (type === "percent") return "Desconto percentual";
  if (type === "fixed") return "Desconto em valor";
  if (type === "free_shipping") return "Frete grátis";
  return "Produto grátis";
}

function rewardBenefit(reward: RewardRow, products: ProductRow[]) {
  if (reward.reward_type === "percent") return `${Number(reward.percentage_value || 0).toLocaleString("pt-BR")}% OFF`;
  if (reward.reward_type === "fixed") return `${formatMoney(reward.fixed_amount)} OFF`;
  if (reward.reward_type === "free_shipping") return "Frete grátis";
  return products.find((product) => product.id === reward.product_id)?.name || "Produto grátis";
}

function rewardIcon(type: RewardType) {
  if (type === "percent") return BadgePercent;
  if (type === "fixed") return ShoppingCart;
  if (type === "free_shipping") return Truck;
  return Package;
}

export default function LoyaltyRewardCatalog() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [restaurantId, setRestaurantId] = useState("");
  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RewardForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user || !restaurant) {
        setRestaurantId("");
        setProgram(null);
        setProducts([]);
        setRewards([]);
        return;
      }

      setRestaurantId(restaurant.id);

      const [{ data: programData, error: programError }, { data: productData, error: productError }] = await Promise.all([
        (supabase as any)
          .from("loyalty_programs")
          .select("id, name")
          .eq("restaurant_id", restaurant.id)
          .maybeSingle(),
        (supabase as any)
          .from("products")
          .select("id, name")
          .eq("restaurant_id", restaurant.id)
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      if (programError) throw programError;
      if (productError) throw productError;

      const currentProgram = programData as ProgramRow | null;
      setProgram(currentProgram);
      setProducts((productData || []) as ProductRow[]);

      if (!currentProgram) {
        setRewards([]);
        return;
      }

      const { data: rewardData, error: rewardError } = await (supabase as any)
        .from("loyalty_rewards")
        .select(
          "id, name, description, reward_type, points_cost, percentage_value, fixed_amount, product_id, minimum_order_amount, reward_validity_days, max_redemptions_total, active, sort_order",
        )
        .eq("restaurant_id", restaurant.id)
        .eq("program_id", currentProgram.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (rewardError) throw rewardError;
      setRewards((rewardData || []) as RewardRow[]);
    } catch (loadError: any) {
      console.error(loadError);
      setError(loadError?.message || "Não foi possível carregar o catálogo de recompensas.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const resetForm = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setError("");
  };

  const editReward = (reward: RewardRow) => {
    setEditingId(reward.id);
    setForm({
      name: reward.name,
      description: reward.description || "",
      rewardType: reward.reward_type,
      pointsCost: String(reward.points_cost),
      percentageValue: reward.percentage_value == null ? "10" : String(reward.percentage_value).replace(".", ","),
      fixedAmount: reward.fixed_amount == null ? "10,00" : formatDecimalInput(reward.fixed_amount),
      productId: reward.product_id || "",
      minimumOrderAmount: formatDecimalInput(reward.minimum_order_amount),
      rewardValidityDays: reward.reward_validity_days == null ? "" : String(reward.reward_validity_days),
      maxRedemptionsTotal: reward.max_redemptions_total == null ? "" : String(reward.max_redemptions_total),
      active: reward.active,
    });
    setNotice("");
    setError("");
  };

  const saveReward = async () => {
    setNotice("");
    setError("");

    if (!restaurantId || !program) {
      setError("Salve a configuração do programa antes de criar recompensas.");
      return;
    }

    const name = form.name.trim();
    if (name.length < 3 || name.length > 80) {
      setError("O nome da recompensa deve ter entre 3 e 80 caracteres.");
      return;
    }

    const description = form.description.trim();
    if (description.length > 240) {
      setError("A descrição da recompensa deve ter no máximo 240 caracteres.");
      return;
    }

    const pointsCost = Number(form.pointsCost);
    if (!Number.isInteger(pointsCost) || pointsCost <= 0) {
      setError("O custo em pontos deve ser um número inteiro maior que zero.");
      return;
    }

    const minimumOrderAmount = parseDecimal(form.minimumOrderAmount);
    if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) {
      setError("Informe um pedido mínimo válido, igual ou maior que R$ 0,00.");
      return;
    }

    const rewardValidityDays = form.rewardValidityDays.trim() === "" ? null : Number(form.rewardValidityDays);
    if (rewardValidityDays != null && (!Number.isInteger(rewardValidityDays) || rewardValidityDays < 1 || rewardValidityDays > 3650)) {
      setError("A validade deve ficar entre 1 e 3650 dias, ou ser deixada em branco.");
      return;
    }

    const maxRedemptionsTotal = form.maxRedemptionsTotal.trim() === "" ? null : Number(form.maxRedemptionsTotal);
    if (maxRedemptionsTotal != null && (!Number.isInteger(maxRedemptionsTotal) || maxRedemptionsTotal <= 0)) {
      setError("O limite total deve ser um número inteiro maior que zero, ou ficar em branco.");
      return;
    }

    let percentageValue: number | null = null;
    let fixedAmount: number | null = null;
    let productId: string | null = null;

    if (form.rewardType === "percent") {
      percentageValue = parseDecimal(form.percentageValue);
      if (!Number.isFinite(percentageValue) || percentageValue <= 0 || percentageValue > 100) {
        setError("O desconto percentual deve ser maior que 0% e no máximo 100%.");
        return;
      }
    } else if (form.rewardType === "fixed") {
      fixedAmount = parseDecimal(form.fixedAmount);
      if (!Number.isFinite(fixedAmount) || fixedAmount <= 0) {
        setError("O desconto em valor deve ser maior que R$ 0,00.");
        return;
      }
    } else if (form.rewardType === "free_product") {
      productId = form.productId || null;
      if (!productId) {
        setError("Selecione o produto que será entregue gratuitamente.");
        return;
      }
    }

    const payload = {
      restaurant_id: restaurantId,
      program_id: program.id,
      name,
      description: description || null,
      reward_type: form.rewardType,
      points_cost: pointsCost,
      percentage_value: percentageValue,
      fixed_amount: fixedAmount,
      product_id: productId,
      minimum_order_amount: minimumOrderAmount,
      reward_validity_days: rewardValidityDays,
      max_redemptions_total: maxRedemptionsTotal,
      active: form.active,
      sort_order: editingId
        ? rewards.find((reward) => reward.id === editingId)?.sort_order || 0
        : rewards.length,
    };

    setSaving(true);
    try {
      if (editingId) {
        const { error: updateError } = await (supabase as any)
          .from("loyalty_rewards")
          .update(payload)
          .eq("restaurant_id", restaurantId)
          .eq("program_id", program.id)
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await (supabase as any)
          .from("loyalty_rewards")
          .insert(payload);
        if (insertError) throw insertError;
      }

      setNotice(editingId ? "Recompensa atualizada com sucesso." : "Recompensa adicionada ao catálogo.");
      resetForm();
      await loadCatalog();
    } catch (saveError: any) {
      console.error(saveError);
      if (saveError?.code === "23505") {
        setError("Já existe uma recompensa com esse nome neste programa.");
      } else {
        setError(saveError?.message || "Não foi possível salvar a recompensa.");
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteReward = async (reward: RewardRow) => {
    if (!restaurantId || !program) return;
    if (!window.confirm(`Excluir “${reward.name}” do catálogo?`)) return;

    setDeletingId(reward.id);
    setNotice("");
    setError("");
    try {
      const { error: deleteError } = await (supabase as any)
        .from("loyalty_rewards")
        .delete()
        .eq("restaurant_id", restaurantId)
        .eq("program_id", program.id)
        .eq("id", reward.id);
      if (deleteError) throw deleteError;

      if (editingId === reward.id) resetForm();
      setNotice("Recompensa removida do catálogo.");
      await loadCatalog();
    } catch (deleteError: any) {
      console.error(deleteError);
      setError(deleteError?.message || "Não foi possível remover a recompensa.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminPageShell className="-mt-6 space-y-5 pb-12">
      <section className="surface-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <Gift size={19} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Frente 5</p>
              <h2 className="mt-1 text-xl font-black text-gray-950">Catálogo de recompensas</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                Defina o que o cliente poderá trocar por pontos. O catálogo configura o benefício; o débito dos pontos e a emissão da recompensa serão feitos pelo fluxo seguro de resgate.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[#fffdfa] px-4 py-3 text-sm">
            <span className="font-black text-gray-950">{rewards.filter((reward) => reward.active).length}</span>
            <span className="ml-1 text-gray-500">recompensa(s) ativa(s)</span>
          </div>
        </div>

        {notice ? (
          <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-5 text-sm font-bold text-gray-500">
            <Loader2 size={17} className="animate-spin" /> Carregando catálogo...
          </div>
        ) : !program ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[#faf8f5] px-4 py-4 text-sm text-gray-600">
            Salve primeiro a configuração do Programa de Fidelidade para liberar o catálogo de recompensas.
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
            <div className="rounded-3xl border border-[var(--line)] bg-[#fffdfa] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--brand)]">
                    {editingId ? "Editar recompensa" : "Nova recompensa"}
                  </p>
                  <h3 className="mt-1 font-black text-gray-950">
                    {editingId ? "Atualize as regras do benefício" : "Adicione um benefício ao catálogo"}
                  </h3>
                </div>
                {editingId ? (
                  <AdminButton variant="ghost" onClick={resetForm} aria-label="Cancelar edição" className="px-3">
                    <X size={16} />
                  </AdminButton>
                ) : null}
              </div>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-gray-700">Nome da recompensa</span>
                  <AdminInput
                    value={form.name}
                    maxLength={80}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ex.: R$ 10 de desconto"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-gray-700">Descrição opcional</span>
                  <AdminInput
                    value={form.description}
                    maxLength={240}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Explique o benefício em uma frase"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Tipo de benefício</span>
                    <AdminSelect
                      value={form.rewardType}
                      onChange={(event) => setForm((current) => ({ ...current, rewardType: event.target.value as RewardType }))}
                    >
                      <option value="fixed">Desconto em valor</option>
                      <option value="percent">Desconto percentual</option>
                      <option value="free_shipping">Frete grátis</option>
                      <option value="free_product">Produto grátis</option>
                    </AdminSelect>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Custo em pontos</span>
                    <AdminInput
                      inputMode="numeric"
                      value={form.pointsCost}
                      onChange={(event) => setForm((current) => ({ ...current, pointsCost: event.target.value }))}
                    />
                  </label>
                </div>

                {form.rewardType === "fixed" ? (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Valor do desconto (R$)</span>
                    <AdminInput
                      inputMode="decimal"
                      value={form.fixedAmount}
                      onChange={(event) => setForm((current) => ({ ...current, fixedAmount: event.target.value }))}
                    />
                  </label>
                ) : null}

                {form.rewardType === "percent" ? (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Percentual de desconto (%)</span>
                    <AdminInput
                      inputMode="decimal"
                      value={form.percentageValue}
                      onChange={(event) => setForm((current) => ({ ...current, percentageValue: event.target.value }))}
                    />
                  </label>
                ) : null}

                {form.rewardType === "free_product" ? (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Produto grátis</span>
                    <AdminSelect
                      value={form.productId}
                      onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                    >
                      <option value="">Selecione um produto</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </AdminSelect>
                    {products.length === 0 ? <span className="mt-1 block text-xs text-gray-400">Não há produtos ativos disponíveis.</span> : null}
                  </label>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Pedido mínimo (R$)</span>
                    <AdminInput
                      inputMode="decimal"
                      value={form.minimumOrderAmount}
                      onChange={(event) => setForm((current) => ({ ...current, minimumOrderAmount: event.target.value }))}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Validade após resgate (dias)</span>
                    <AdminInput
                      inputMode="numeric"
                      value={form.rewardValidityDays}
                      onChange={(event) => setForm((current) => ({ ...current, rewardValidityDays: event.target.value }))}
                      placeholder="Sem prazo"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Limite total de resgates</span>
                    <AdminInput
                      inputMode="numeric"
                      value={form.maxRedemptionsTotal}
                      onChange={(event) => setForm((current) => ({ ...current, maxRedemptionsTotal: event.target.value }))}
                      placeholder="Sem limite"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Status</span>
                    <AdminSelect
                      value={form.active ? "active" : "inactive"}
                      onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === "active" }))}
                    >
                      <option value="active">Ativa</option>
                      <option value="inactive">Inativa</option>
                    </AdminSelect>
                  </label>
                </div>

                <AdminButton onClick={() => void saveReward()} disabled={saving} className="w-full">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? <Save size={16} /> : <Plus size={16} />}
                  {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar recompensa"}
                </AdminButton>
              </div>
            </div>

            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--brand)]">Benefícios cadastrados</p>
                  <h3 className="mt-1 font-black text-gray-950">Recompensas do programa “{program.name}”</h3>
                </div>
                <span className="text-xs font-bold text-gray-400">{rewards.length} total</span>
              </div>

              {rewards.length === 0 ? (
                <div className="mt-4 rounded-3xl border border-dashed border-orange-200 bg-orange-50/40 p-8 text-center">
                  <Gift size={24} className="mx-auto text-[var(--brand)]" />
                  <p className="mt-3 font-black text-gray-950">Nenhuma recompensa cadastrada</p>
                  <p className="mt-1 text-sm text-gray-500">Crie o primeiro benefício para preparar o futuro fluxo de resgate.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {rewards.map((reward) => {
                    const Icon = rewardIcon(reward.reward_type);
                    return (
                      <article key={reward.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
                              <Icon size={17} />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-black text-gray-950">{reward.name}</h4>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${reward.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                                  {reward.active ? "Ativa" : "Inativa"}
                                </span>
                              </div>
                              <p className="mt-1 text-sm font-bold text-[var(--brand)]">
                                {rewardBenefit(reward, products)} · {reward.points_cost.toLocaleString("pt-BR")} pts
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {rewardTypeLabel(reward.reward_type)} · pedido mínimo {formatMoney(reward.minimum_order_amount)} · {reward.reward_validity_days ? `${reward.reward_validity_days} dias de validade` : "sem expiração após resgate"}
                              </p>
                              {reward.description ? <p className="mt-2 text-sm leading-5 text-gray-500">{reward.description}</p> : null}
                              {reward.max_redemptions_total ? <p className="mt-2 text-xs font-bold text-gray-400">Limite total: {reward.max_redemptions_total.toLocaleString("pt-BR")} resgates</p> : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <AdminButton variant="secondary" onClick={() => editReward(reward)} className="px-3" aria-label={`Editar ${reward.name}`}>
                              <Pencil size={15} />
                            </AdminButton>
                            <AdminButton
                              variant="danger"
                              onClick={() => void deleteReward(reward)}
                              disabled={deletingId === reward.id}
                              className="px-3"
                              aria-label={`Excluir ${reward.name}`}
                            >
                              {deletingId === reward.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                            </AdminButton>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}
