"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  Filter,
  Loader2,
  Percent,
  Plus,
  Search,
  Ticket,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { useToast } from "@/components/ui/toast-provider";
import {
  AdminButton,
  AdminInput,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
  SortableTableHeader,
  type SortDirection,
} from "@/components/ui/admin-primitives";
import { AdminEmptyState, AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";

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

type CouponSortKey =
  | "code"
  | "value"
  | "active"
  | "ordersCount"
  | "uniqueCustomers"
  | "convertedRevenue"
  | "storeInvestment"
  | "created_at";

type StatusFilter = "all" | "active" | "paused";

const EMPTY_METRICS: CouponMetrics = {
  ordersCount: 0,
  uniqueCustomers: 0,
  convertedRevenue: 0,
  storeInvestment: 0,
};

const SORT_OPTIONS: Array<{ value: CouponSortKey; label: string }> = [
  { value: "created_at", label: "Data de criação" },
  { value: "code", label: "Código" },
  { value: "value", label: "Desconto" },
  { value: "active", label: "Status" },
  { value: "ordersCount", label: "Usos" },
  { value: "uniqueCustomers", label: "Clientes" },
  { value: "convertedRevenue", label: "Receita convertida" },
  { value: "storeInvestment", label: "Investimento" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDiscount(coupon: Coupon) {
  return coupon.discount_type === "percent"
    ? `${Number(coupon.value)}%`
    : formatMoney(Number(coupon.value));
}

function getSortValue(coupon: Coupon, metrics: CouponMetrics, key: CouponSortKey) {
  if (key === "code") return coupon.code.toLocaleLowerCase("pt-BR");
  if (key === "value") return Number(coupon.value || 0);
  if (key === "active") return coupon.active ? 1 : 0;
  if (key === "created_at") return new Date(coupon.created_at).getTime();
  return metrics[key];
}

function CouponsWorkspaceSkeleton() {
  return <AdminPageSkeleton ariaLabel="Carregando cupons" metrics={4} />;
}

export default function CouponsWorkspace() {
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [metricsByCode, setMetricsByCode] = useState<Record<string, CouponMetrics>>({});
  const [couponCustomerCount, setCouponCustomerCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<CouponSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [form, setForm] = useState({ code: "", value: "", type: "percent" });

  const fetchCoupons = async () => {
    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user) {
        router.push("/admin/login");
        return;
      }
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

      if (couponsError) throw couponsError;
      if (ordersError) throw ordersError;

      const metrics: Record<string, CouponMetrics> = {};
      const customersByCode = new Map<string, Set<string>>();
      const allCustomers = new Set<string>();

      (ordersData || []).forEach((order: any) => {
        const code = order.coupon_code;
        if (!code) return;
        metrics[code] ||= { ...EMPTY_METRICS };
        customersByCode.set(code, customersByCode.get(code) || new Set<string>());
        metrics[code].ordersCount += 1;
        metrics[code].convertedRevenue += Number(order.status === "canceled" ? 0 : order.total || 0);
        metrics[code].storeInvestment += Number(order.discount || 0);
        if (order.customer_phone) {
          customersByCode.get(code)?.add(order.customer_phone);
          allCustomers.add(order.customer_phone);
        }
      });

      Object.keys(metrics).forEach((code) => {
        metrics[code].uniqueCustomers = customersByCode.get(code)?.size || 0;
      });

      setMetricsByCode(metrics);
      setCouponCustomerCount(allCustomers.size);
      setCoupons((couponsData || []) as Coupon[]);
    } catch (error) {
      console.error(error);
      setErrorMsg("Erro ao carregar os cupons.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const metrics = Object.values(metricsByCode);
    const totalUses = metrics.reduce((sum, item) => sum + item.ordersCount, 0);
    const totalConvertedRevenue = metrics.reduce((sum, item) => sum + item.convertedRevenue, 0);
    const totalDiscounts = metrics.reduce((sum, item) => sum + item.storeInvestment, 0);
    return {
      activeCount: coupons.filter((coupon) => coupon.active).length,
      totalUses,
      totalConvertedRevenue,
      totalDiscounts,
      uniqueCustomers: couponCustomerCount,
      returnRate: totalDiscounts > 0 ? totalConvertedRevenue / totalDiscounts : 0,
    };
  }, [couponCustomerCount, coupons, metricsByCode]);

  const visibleCoupons = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    const direction = sortDirection === "asc" ? 1 : -1;

    return coupons
      .filter((coupon) => {
        const matchesQuery = !term || coupon.code.toLocaleLowerCase("pt-BR").includes(term);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" ? coupon.active : !coupon.active);
        return matchesQuery && matchesStatus;
      })
      .sort((left, right) => {
        const leftValue = getSortValue(left, metricsByCode[left.code] || EMPTY_METRICS, sortKey);
        const rightValue = getSortValue(right, metricsByCode[right.code] || EMPTY_METRICS, sortKey);
        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return (leftValue - rightValue) * direction;
        }
        return String(leftValue).localeCompare(String(rightValue), "pt-BR", {
          numeric: true,
          sensitivity: "base",
        }) * direction;
      });
  }, [coupons, metricsByCode, query, sortDirection, sortKey, statusFilter]);

  const toggleSort = (key: CouponSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "code" ? "asc" : "desc");
  };

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
      await fetchCoupons();
    } catch (error) {
      showToast({
        title: "Não foi possível criar o cupom",
        description: error instanceof Error ? error.message : "Revise os dados e tente novamente.",
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

  if (loading) return <CouponsWorkspaceSkeleton />;

  if (errorMsg) return <AdminErrorState description={errorMsg} />;

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Cupons"
        description="Crie campanhas e acompanhe o impacto de cada código promocional."
        icon={<Ticket size={24} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Cupons ativos", `${summary.activeCount} de ${coupons.length}`],
          ["Clientes impactados", String(summary.uniqueCustomers)],
          ["Receita convertida", formatMoney(summary.totalConvertedRevenue)],
          ["Retorno por desconto", summary.returnRate ? `${summary.returnRate.toFixed(1)}x` : "--"],
        ].map(([label, value]) => (
          <div key={label} className="surface-card rounded-[24px] p-5">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-3 text-3xl font-black text-gray-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="surface-card rounded-[28px] p-4 sm:p-5 md:p-6">
        <h2 className="text-lg font-black text-gray-950">Novo cupom</h2>
        <form onSubmit={handleCreate} className="mt-5 grid gap-4 md:grid-cols-[1.2fr_220px_180px_160px]">
          <AdminInput
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            placeholder="Ex: PRIMEIRACOMPRA"
            className="font-bold uppercase"
          />
          <AdminSelect
            value={form.type}
            onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
          >
            <option value="percent">Porcentagem (%)</option>
            <option value="fixed">Valor fixo (R$)</option>
          </AdminSelect>
          <AdminInput
            inputMode="decimal"
            value={form.value}
            onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
            placeholder="Valor"
          />
          <AdminButton type="submit" disabled={creating} className="bg-[#171311] text-white hover:bg-black">
            {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            Criar cupom
          </AdminButton>
        </form>
      </section>

      <section className="surface-card rounded-[28px] p-4 sm:p-5 md:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative min-w-0">
            <span className="sr-only">Buscar cupons</span>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <AdminInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código do cupom" className="pl-11" />
          </label>
          <AdminButton variant="secondary" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen}>
            <Filter size={16} /> Filtros e ordenação
          </AdminButton>
        </div>

        {filtersOpen && (
          <div className="mt-3 grid gap-3 rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4 sm:grid-cols-3">
            <AdminSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="paused">Pausados</option>
            </AdminSelect>
            <AdminSelect value={sortKey} onChange={(event) => setSortKey(event.target.value as CouponSortKey)} className="xl:hidden">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>Ordenar por {option.label}</option>)}
            </AdminSelect>
            <AdminButton variant="secondary" className="xl:hidden" onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}>
              {sortDirection === "asc" ? "Crescente" : "Decrescente"}
            </AdminButton>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-[24px] border border-[var(--line)] bg-white">
          <div className="hidden grid-cols-[minmax(130px,1fr)_110px_110px_90px_90px_130px_130px_110px_92px] items-center gap-3 border-b border-[var(--line)] bg-[#fffdfa] px-5 py-4 text-xs uppercase tracking-[0.08em] xl:grid">
            <SortableTableHeader label="Código" active={sortKey === "code"} direction={sortKey === "code" ? sortDirection : null} onClick={() => toggleSort("code")} />
            <SortableTableHeader label="Desconto" active={sortKey === "value"} direction={sortKey === "value" ? sortDirection : null} onClick={() => toggleSort("value")} />
            <SortableTableHeader label="Status" active={sortKey === "active"} direction={sortKey === "active" ? sortDirection : null} onClick={() => toggleSort("active")} />
            <SortableTableHeader label="Usos" active={sortKey === "ordersCount"} direction={sortKey === "ordersCount" ? sortDirection : null} onClick={() => toggleSort("ordersCount")} />
            <SortableTableHeader label="Clientes" active={sortKey === "uniqueCustomers"} direction={sortKey === "uniqueCustomers" ? sortDirection : null} onClick={() => toggleSort("uniqueCustomers")} />
            <SortableTableHeader label="Convertido" active={sortKey === "convertedRevenue"} direction={sortKey === "convertedRevenue" ? sortDirection : null} onClick={() => toggleSort("convertedRevenue")} />
            <SortableTableHeader label="Investimento" active={sortKey === "storeInvestment"} direction={sortKey === "storeInvestment" ? sortDirection : null} onClick={() => toggleSort("storeInvestment")} />
            <SortableTableHeader label="Criado em" active={sortKey === "created_at"} direction={sortKey === "created_at" ? sortDirection : null} onClick={() => toggleSort("created_at")} />
            <span className="text-right font-bold text-gray-400">Ações</span>
          </div>

          {visibleCoupons.length === 0 ? (
            <AdminEmptyState title="Nenhum cupom encontrado" description="Revise a busca e os filtros selecionados." />
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {visibleCoupons.map((coupon) => {
                const metrics = metricsByCode[coupon.code] || EMPTY_METRICS;
                return (
                  <article key={coupon.id}>
                    <div className="hidden grid-cols-[minmax(130px,1fr)_110px_110px_90px_90px_130px_130px_110px_92px] items-center gap-3 px-5 py-5 text-sm xl:grid">
                      <CouponIdentity coupon={coupon} />
                      <strong>{formatDiscount(coupon)}</strong>
                      <StatusBadge active={coupon.active} />
                      <strong>{metrics.ordersCount}</strong>
                      <span>{metrics.uniqueCustomers}</span>
                      <strong>{formatMoney(metrics.convertedRevenue)}</strong>
                      <span>{formatMoney(metrics.storeInvestment)}</span>
                      <span className="text-gray-500">{formatDate(coupon.created_at)}</span>
                      <CouponActions coupon={coupon} onToggle={() => void toggleCoupon(coupon)} onRemove={() => void removeCoupon(coupon.id)} />
                    </div>

                    <div className="p-4 xl:hidden">
                      <div className="flex items-start justify-between gap-3">
                        <CouponIdentity coupon={coupon} />
                        <StatusBadge active={coupon.active} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Metric label="Desconto" value={formatDiscount(coupon)} />
                        <Metric label="Usos" value={String(metrics.ordersCount)} />
                        <Metric label="Clientes" value={String(metrics.uniqueCustomers)} />
                        <Metric label="Convertido" value={formatMoney(metrics.convertedRevenue)} />
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs text-gray-500">Investimento: {formatMoney(metrics.storeInvestment)}</p>
                        <CouponActions coupon={coupon} onToggle={() => void toggleCoupon(coupon)} onRemove={() => void removeCoupon(coupon.id)} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-gray-500">
          <span>{summary.totalUses} usos</span>
          <span>•</span>
          <span>{formatMoney(summary.totalDiscounts)} em descontos concedidos</span>
          <span>•</span>
          <span>{visibleCoupons.length} cupons visíveis</span>
        </div>
      </section>
    </AdminPageShell>
  );
}

function CouponIdentity({ coupon }: { coupon: Coupon }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]"><Percent size={17} /></span>
      <div className="min-w-0"><p className="truncate font-black text-gray-950">{coupon.code}</p><p className="mt-1 text-xs text-gray-400">{formatDate(coupon.created_at)}</p></div>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{active ? "Ativo" : "Pausado"}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#fcfaf7] px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">{label}</p><p className="mt-2 font-black text-gray-950">{value}</p></div>;
}

function CouponActions({ coupon, onToggle, onRemove }: { coupon: Coupon; onToggle: () => void; onRemove: () => void }) {
  return (
    <div className="ml-auto flex justify-end gap-2">
      <button type="button" onClick={onToggle} className="rounded-xl border border-[var(--line)] bg-white p-2 text-gray-600" title={coupon.active ? "Pausar cupom" : "Ativar cupom"}>
        {coupon.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
      </button>
      <button type="button" onClick={onRemove} className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600" title="Excluir cupom"><Trash2 size={16} /></button>
    </div>
  );
}
