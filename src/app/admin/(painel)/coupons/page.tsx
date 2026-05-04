"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Percent,
  Plus,
  Ticket,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { useToast } from "@/components/ui/toast-provider";

type Coupon = {
  id: string;
  restaurant_id: string;
  code: string;
  value: number;
  discount_type: "percent" | "fixed";
  active: boolean;
  created_at: string;
};

type CouponMetrics = {
  ordersCount: number;
  uniqueCustomers: number;
  convertedRevenue: number;
  storeInvestment: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function CouponsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white" />
        <div className="space-y-3">
          <div className="h-6 w-32 rounded-full bg-white" />
          <div className="h-4 w-72 rounded-full bg-white" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="surface-card rounded-[24px] p-5">
            <div className="h-4 w-24 rounded-full bg-white" />
            <div className="mt-4 h-8 w-28 rounded-full bg-white" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CouponsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [metricsByCode, setMetricsByCode] = useState<Record<string, CouponMetrics>>({});
  const [couponCustomerCount, setCouponCustomerCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const { showToast } = useToast();
  const [form, setForm] = useState({
    code: "",
    value: "",
    type: "percent",
  });

  useEffect(() => {
    fetchCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCoupons = async () => {
    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user) return router.push("/admin/login");
      if (!restaurant) {
        setErrorMsg("Não foi possível localizar a loja.");
        return;
      }

      setRestaurantId(restaurant.id);

      const [{ data: couponsData, error: couponsError }, { data: ordersData, error: ordersError }] =
        await Promise.all([
          (supabase as any)
            .from("coupons")
            .select("*")
            .eq("restaurant_id", restaurant.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("orders")
            .select("coupon_code, customer_phone, total, discount, status")
            .eq("restaurant_id", restaurant.id)
            .not("coupon_code", "is", null),
        ]);

      if (couponsError) {
        setErrorMsg(couponsError.message);
        return;
      }

      if (ordersError) {
        setErrorMsg(ordersError.message);
        return;
      }

      const metrics: Record<string, CouponMetrics> = {};
      const allCouponCustomers = new Set<string>();
      (ordersData || []).forEach((order: any) => {
        const code = order.coupon_code;
        if (!code) return;

        if (!metrics[code]) {
          metrics[code] = {
            ordersCount: 0,
            uniqueCustomers: 0,
            convertedRevenue: 0,
            storeInvestment: 0,
          };
        }

        metrics[code].ordersCount += 1;
        metrics[code].convertedRevenue += Number(order.status === "canceled" ? 0 : order.total || 0);
        metrics[code].storeInvestment += Number(order.discount || 0);
        if (order.customer_phone) {
          allCouponCustomers.add(order.customer_phone);
        }
      });

      Object.keys(metrics).forEach((code) => {
        const uniquePhones = new Set(
          (ordersData || [])
            .filter((order: any) => order.coupon_code === code && order.customer_phone)
            .map((order: any) => order.customer_phone),
        );
        metrics[code].uniqueCustomers = uniquePhones.size;
      });

      setMetricsByCode(metrics);
      setCouponCustomerCount(allCouponCustomers.size);
      setCoupons((couponsData || []) as Coupon[]);
    } catch (error) {
      console.error(error);
      setErrorMsg("Erro ao carregar os cupons.");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const activeCount = coupons.filter((coupon) => coupon.active).length;
    const totalUses = Object.values(metricsByCode).reduce((sum, metric) => sum + metric.ordersCount, 0);
    const totalConvertedRevenue = Object.values(metricsByCode).reduce(
      (sum, metric) => sum + metric.convertedRevenue,
      0,
    );
    const totalDiscounts = Object.values(metricsByCode).reduce(
      (sum, metric) => sum + metric.storeInvestment,
      0,
    );
    return {
      activeCount,
      totalUses,
      totalConvertedRevenue,
      totalDiscounts,
      uniqueCustomers: couponCustomerCount,
    };
  }, [couponCustomerCount, coupons, metricsByCode]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.code.trim() || !form.value.trim() || !restaurantId) return;

    setCreating(true);

    try {
      const { error } = await (supabase as any).from("coupons").insert({
        restaurant_id: restaurantId,
        code: form.code.trim().toUpperCase(),
        value: Number(form.value.replace(",", ".")),
        discount_type: form.type,
        active: true,
      });

      if (error) throw error;

      setForm({ code: "", value: "", type: "percent" });
      showToast({
        title: "Cupom criado",
        description: "O novo cupom já está disponível para uso no checkout.",
        tone: "success",
      });
      fetchCoupons();
    } catch (error: any) {
      console.error(error);
      showToast({
        title: "Não foi possível criar o cupom",
        description: error.message || "Revise os dados e tente novamente.",
        tone: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const toggleCoupon = async (coupon: Coupon) => {
    await (supabase as any).from("coupons").update({ active: !coupon.active }).eq("id", coupon.id);
    setCoupons((current) =>
      current.map((item) => (item.id === coupon.id ? { ...item, active: !item.active } : item)),
    );
  };

  const removeCoupon = async (id: string) => {
    if (!confirm("Deseja apagar este cupom?")) return;
    await (supabase as any).from("coupons").delete().eq("id", id);
    setCoupons((current) => current.filter((item) => item.id !== id));
  };

  if (loading) return <CouponsSkeleton />;

  if (errorMsg) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-red-700">
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center gap-4">
        <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm">
          <Ticket size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950">Cupons</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Crie campanhas e acompanhe o impacto de cada código promocional.
          </p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Cupons cadastrados</p>
          <p className="mt-3 text-3xl font-black text-gray-950">{coupons.length}</p>
        </div>
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Cupons ativos</p>
          <p className="mt-3 text-3xl font-black text-gray-950">{summary.activeCount}</p>
        </div>
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Clientes impactados</p>
          <p className="mt-3 text-3xl font-black text-gray-950">{summary.uniqueCustomers}</p>
          <p className="mt-2 text-xs text-gray-400">{summary.totalUses} usos de cupons na loja</p>
        </div>
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Receita convertida</p>
          <p className="mt-3 text-3xl font-black text-gray-950">
            {formatMoney(summary.totalConvertedRevenue)}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            {formatMoney(summary.totalDiscounts)} em descontos concedidos
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Usos totais</p>
          <p className="mt-3 text-3xl font-black text-gray-950">{summary.totalUses}</p>
          <p className="mt-2 text-xs text-gray-400">Pedidos que finalizaram com cupom aplicado</p>
        </div>
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Investimento da loja</p>
          <p className="mt-3 text-3xl font-black text-gray-950">{formatMoney(summary.totalDiscounts)}</p>
        </div>
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Retorno por desconto</p>
          <p className="mt-3 text-3xl font-black text-gray-950">
            {summary.totalDiscounts > 0
              ? `${(summary.totalConvertedRevenue / summary.totalDiscounts).toFixed(1)}x`
              : "--"}
          </p>
          <p className="mt-2 text-xs text-gray-400">Receita gerada para cada real investido</p>
        </div>
      </section>

      <section className="surface-card mt-6 rounded-[28px] p-5 md:p-6">
        <h2 className="text-lg font-black text-gray-950">Novo cupom</h2>
        <form onSubmit={handleCreate} className="mt-5 grid gap-4 md:grid-cols-[1.2fr_220px_180px_160px]">
          <input
            value={form.code}
            onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
            placeholder="Ex: PRIMEIRACOMPRA"
            className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold uppercase outline-none"
          />
          <select
            value={form.type}
            onChange={(e) => setForm((current) => ({ ...current, type: e.target.value }))}
            className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold outline-none"
          >
            <option value="percent">Porcentagem (%)</option>
            <option value="fixed">Valor fixo (R$)</option>
          </select>
          <input
            value={form.value}
            onChange={(e) => setForm((current) => ({ ...current, value: e.target.value }))}
            placeholder="Valor"
            className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold outline-none"
          />
          <button
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#171311] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            Criar cupom
          </button>
        </form>
      </section>

      <section className="surface-card mt-6 rounded-[28px] p-5 md:p-6">
        <div className="space-y-4">
          {coupons.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--line)] bg-white py-16 text-center text-sm text-gray-500">
              Nenhum cupom cadastrado ainda.
            </div>
          ) : (
            coupons.map((coupon) => {
              const metrics = metricsByCode[coupon.code] || {
                ordersCount: 0,
                uniqueCustomers: 0,
                convertedRevenue: 0,
                storeInvestment: 0,
              };

              return (
                <div key={coupon.id} className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white">
                  <div className="flex flex-col gap-4 border-b border-[var(--line)] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
                        <Percent size={18} />
                      </span>
                      <div>
                        <p className="font-black text-gray-950">{coupon.code}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          Criado em {new Date(coupon.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-black text-gray-950">
                        {coupon.discount_type === "percent"
                          ? `${Number(coupon.value)}%`
                          : formatMoney(Number(coupon.value))}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          coupon.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {coupon.active ? "Ativo" : "Pausado"}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleCoupon(coupon)}
                          className="rounded-xl border border-[var(--line)] bg-white p-2 text-gray-600"
                          title={coupon.active ? "Pausar cupom" : "Ativar cupom"}
                        >
                          {coupon.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button
                          onClick={() => removeCoupon(coupon.id)}
                          className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600"
                          title="Excluir cupom"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 px-6 py-5 md:grid-cols-4">
                    <div className="rounded-2xl bg-[#fcfaf7] px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Usos</p>
                      <p className="mt-2 text-2xl font-black text-gray-950">{metrics.ordersCount}</p>
                    </div>
                    <div className="rounded-2xl bg-[#fcfaf7] px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Clientes</p>
                      <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black text-gray-950">
                        <Users size={18} className="text-gray-400" />
                        {metrics.uniqueCustomers}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#fcfaf7] px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Convertido</p>
                      <p className="mt-2 text-2xl font-black text-gray-950">{formatMoney(metrics.convertedRevenue)}</p>
                    </div>
                    <div className="rounded-2xl bg-[#fcfaf7] px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Gasto da loja</p>
                      <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black text-gray-950">
                        <Wallet size={18} className="text-gray-400" />
                        {formatMoney(metrics.storeInvestment)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
