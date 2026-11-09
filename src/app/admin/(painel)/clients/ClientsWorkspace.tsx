"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight, CalendarClock, ChevronDown, ChevronLeft, ChevronRight,
  Coins, Download, MessageCircle, ReceiptText, RefreshCw, Search,
  ShoppingBag, UserRound, Users, Wallet,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { formatCustomerPhone } from "@/features/loyalty/manual-credit-customers";
import { AdminButton, AdminInput, AdminPageHeader, AdminPageShell, AdminSelect } from "@/components/ui/admin-primitives";
import { AdminEmptyState, AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import {
  buildCustomerProfiles, normalizeCustomerPhone, segmentCustomer,
  type AccountRecord, type CustomerProfile, type CustomerRecord, type CustomerSegment,
  type PurchaseRecord, type TransactionRecord,
} from "@/features/clients/customer-hub";

const PER_PAGE = 10;
const DB_PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 15000;
type Filter = "all" | "active" | "inactive" | "never";
type Sort = "last" | "spent" | "orders" | "name";
type Truncation = { customers: boolean; orders: boolean; accounts: boolean; transactions: boolean };

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "Sem compras";
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

async function fetchPaged<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  while (rows.length < MAX_ROWS_PER_TABLE) {
    const from = rows.length;
    const size = Math.min(DB_PAGE_SIZE, MAX_ROWS_PER_TABLE - from);
    const response = await loadPage(from, from + size - 1);
    if (response.error) throw new Error(response.error.message);
    const batch = response.data || [];
    rows.push(...batch);
    if (batch.length < size) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function csvCell(value: string | number) {
  const raw = String(value);
  // Prevent spreadsheet formula injection in fields supplied by customers.
  const safe = /^[=+\-@\t\r]/.test(raw.trimStart()) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function exportClients(rows: CustomerProfile[], completeOrders: boolean) {
  const headers = ["Cliente", "Telefone", "Compras concluídas", "Total gasto (R$)", "Última compra", "Saldo de pontos", "Segmento", "Endereços"];
  const columns = rows.map(client => {
    const segment = segmentCustomer(client, completeOrders);
    const segmentLabel = segment === "active" ? "Ativo" : segment === "inactive" ? "Inativo 30+ dias" : segment === "never" ? "Sem compras" : "Histórico parcial";
    return [
      client.name, client.phone, client.orderCount, client.totalSpent.toFixed(2).replace(".", ","),
      formatDate(client.lastOrderDate), client.pointsBalance, segmentLabel, client.addresses.join(" | "),
    ];
  });
  const content = [headers, ...columns].map(row => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "shifuh-central-clientes.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function segmentInfo(segment: CustomerSegment) {
  if (segment === "active") return { label: "Ativo · últimos 30 dias", classes: "bg-emerald-50 text-emerald-800" };
  if (segment === "inactive") return { label: "Sem comprar há 30+ dias", classes: "bg-amber-50 text-amber-800" };
  if (segment === "never") return { label: "Sem compras concluídas", classes: "bg-blue-50 text-blue-800" };
  return { label: "Histórico incompleto", classes: "bg-gray-100 text-gray-700" };
}

export default function ClientsWorkspace() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [reload, setReload] = useState(0);
  const [clients, setClients] = useState<CustomerProfile[]>([]);
  const [partial, setPartial] = useState<Truncation>({ customers: false, orders: false, accounts: false, transactions: false });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("last");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErrorMsg("");
      try {
        const { restaurant, user, error } = await getCurrentRestaurant(supabase);
        if (!active) return;
        if (!user) { router.replace("/admin/login"); return; }
        if (error || !restaurant) throw new Error("Não foi possível confirmar a loja.");

        const restaurantId: string = restaurant.id;
        // Every read is restricted to the authenticated restaurant; RLS also applies.
        // The PostgREST default row limit is avoided using explicit pagination.
        const [customersResult, ordersResult, accountsResult, transactionsResult] = await Promise.all([
          fetchPaged<CustomerRecord>(async (from, to) => {
            const { data, error } = await supabase.from("customers")
              .select("id,name,phone,created_at").eq("restaurant_id", restaurantId)
              .order("created_at", { ascending: false }).range(from, to);
            return { data: data as CustomerRecord[] | null, error };
          }),
          fetchPaged<PurchaseRecord>(async (from, to) => {
            const { data, error } = await supabase.from("orders")
              .select("id,customer_phone,customer_name,total,created_at,status,display_number,payment_method,is_test,address")
              .eq("restaurant_id", restaurantId).neq("status", "canceled").eq("is_test", false)
              .order("created_at", { ascending: false }).range(from, to);
            return { data: data as PurchaseRecord[] | null, error };
          }),
          fetchPaged<AccountRecord>(async (from, to) => {
            const { data, error } = await supabase.from("loyalty_accounts")
              .select("customer_id,points_balance,lifetime_earned").eq("restaurant_id", restaurantId)
              .order("created_at", { ascending: false }).range(from, to);
            return { data: data as AccountRecord[] | null, error };
          }),
          fetchPaged<TransactionRecord>(async (from, to) => {
            const { data, error } = await supabase.from("loyalty_point_transactions")
              .select("id,customer_id,points_delta,transaction_type,description,created_at")
              .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).range(from, to);
            return { data: data as TransactionRecord[] | null, error };
          }),
        ]);

        if (!active) return;
        setClients(buildCustomerProfiles(customersResult.rows, ordersResult.rows, accountsResult.rows, transactionsResult.rows));
        setPartial({ customers: customersResult.truncated, orders: ordersResult.truncated, accounts: accountsResult.truncated, transactions: transactionsResult.truncated });
      } catch (caught) {
        if (active) setErrorMsg(caught instanceof Error ? caught.message : "Erro ao carregar clientes.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [reload, router, supabase]);

  const completeOrders = !partial.orders;
  const summary = useMemo(() => {
    const active = clients.filter(client => segmentCustomer(client, completeOrders) === "active").length;
    const inactive = clients.filter(client => segmentCustomer(client, completeOrders) === "inactive").length;
    const never = clients.filter(client => segmentCustomer(client, completeOrders) === "never").length;
    return { active, inactive, never, points: clients.reduce((sum, client) => sum + client.pointsBalance, 0) };
  }, [clients, completeOrders]);

  const visible = useMemo(() => {
    const nameTerm = normalizeSearch(search);
    const phoneTerm = search.replace(/\D/g, "");
    const result = clients.filter(client => {
      if (filter !== "all" && segmentCustomer(client, completeOrders) !== filter) return false;
      return !nameTerm || normalizeSearch(client.name).includes(nameTerm) ||
        (phoneTerm.length > 0 && client.phone.includes(phoneTerm));
    });
    result.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sort === "spent") return b.totalSpent - a.totalSpent;
      if (sort === "orders") return b.orderCount - a.orderCount;
      return (b.lastOrderDate || "").localeCompare(a.lastOrderDate || "");
    });
    return result;
  }, [clients, search, filter, sort, completeOrders]);

  useEffect(() => { setPage(1); setExpanded(null); }, [search, filter, sort]);
  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const rows = visible.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const isPartial = Object.values(partial).some(Boolean);

  if (loading) return <AdminPageSkeleton ariaLabel="Carregando Central de Clientes" metrics={4} />;
  if (errorMsg) return <AdminErrorState description={errorMsg} onRetry={() => setReload(value => value + 1)} />;

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: "Todos", count: clients.length },
    { id: "active", label: "Ativos", count: summary.active },
    { id: "inactive", label: "Inativos 30+ dias", count: summary.inactive },
    { id: "never", label: "Sem compras", count: summary.never },
  ];

  return (
    <AdminPageShell className="space-y-5 pb-12">
      <AdminPageHeader
        title="Central de Clientes"
        description="Compras, fidelidade e oportunidades para reativar clientes em um só lugar."
        icon={<Users size={24} />}
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <AdminButton variant="secondary" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} /> Atualizar</AdminButton>
            <AdminButton variant="secondary" onClick={() => exportClients(visible, completeOrders)}><Download size={16} /> Exportar CSV</AdminButton>
          </div>
        }
      />

      {isPartial ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Volume elevado de registros: esta visualização está parcial (até {MAX_ROWS_PER_TABLE.toLocaleString("pt-BR")} linhas por conjunto).
          {partial.orders ? " Clientes sem compras identificadas podem ter histórico mais antigo; não são classificados como novos." : ""}
          {partial.accounts ? " O saldo total de pontos pode estar incompleto." : ""}
        </div>
      ) : null}

      <section aria-label="Indicadores de clientes" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Clientes identificados", value: clients.length.toLocaleString("pt-BR"), icon: <Users size={18} /> },
          { label: "Ativos · 30 dias", value: String(summary.active), icon: <ShoppingBag size={18} /> },
          { label: "Inativos · 30+ dias", value: String(summary.inactive), icon: <CalendarClock size={18} /> },
          { label: "Pontos disponíveis", value: summary.points.toLocaleString("pt-BR"), icon: <Coins size={18} /> },
        ].map(item => (
          <div key={item.label} className="surface-card min-w-0 rounded-2xl border border-orange-100 bg-white p-4 sm:rounded-[24px] sm:p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 sm:text-sm">
              <span className="text-[var(--brand)]">{item.icon}</span>{item.label}
            </div>
            <p className="mt-3 break-words text-2xl font-black tabular-nums text-gray-950 sm:text-3xl">{item.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Explorar clientes" className="surface-card space-y-4 rounded-[24px] p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_210px]">
          <label className="relative min-w-0">
            <span className="sr-only">Buscar clientes</span>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <AdminInput value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por nome ou telefone" className="w-full pl-11" />
          </label>
          <label>
            <span className="sr-only">Ordenar clientes</span>
            <AdminSelect className="w-full" value={sort} onChange={event => setSort(event.target.value as Sort)}>
              <option value="last">Compra mais recente</option>
              <option value="spent">Maior valor gasto</option>
              <option value="orders">Mais compras</option>
              <option value="name">Nome A-Z</option>
            </AdminSelect>
          </label>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar atividade dos clientes">
          {filters.map(item => (
            <button key={item.id} type="button" disabled={partial.orders && item.id === "never"}
              aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}
              className={"min-h-10 rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 sm:text-sm " +
                (filter === item.id ? "border-orange-500 bg-orange-50 text-orange-800" : "border-[var(--line)] bg-white text-gray-600 hover:border-orange-200")}>
              {item.label} <span className="ml-1 tabular-nums">{item.count}</span>
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <AdminEmptyState compact title="Nenhum cliente encontrado" description="Tente outro filtro ou busque pelo telefone." />
        ) : (
          <div className="space-y-3">
            {rows.map(client => {
              const segment = segmentInfo(segmentCustomer(client, completeOrders));
              const opened = expanded === client.key;
              const panelId = "customer-hub-detail-" + client.key;
              return (
                <article key={client.key} data-customer-phone={client.phone}
                  className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                          <UserRound size={20} />
                        </span>
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-black text-gray-950">{client.name}</h2>
                          <p className="mt-1 text-sm text-gray-600">{formatCustomerPhone(client.phone)}</p>
                          <span className={"mt-2 inline-flex rounded-lg px-2.5 py-1 text-xs font-bold " + segment.classes}>{segment.label}</span>
                        </div>
                      </div>
                      <div className="shrink-0 rounded-xl bg-orange-50 px-3 py-2 text-right">
                        <p className="text-[11px] font-semibold text-orange-700">Saldo de pontos</p>
                        <p className="text-lg font-black tabular-nums text-orange-800">{client.pointsBalance}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="min-w-0 rounded-xl bg-[#fcfaf7] p-3">
                        <p className="text-[11px] text-gray-500">Compras</p>
                        <p className="mt-1 text-sm font-black tabular-nums text-gray-900">{client.orderCount}</p>
                      </div>
                      <div className="min-w-0 rounded-xl bg-[#fcfaf7] p-3">
                        <p className="text-[11px] text-gray-500">Total gasto</p>
                        <p className="mt-1 break-words text-sm font-black tabular-nums text-gray-900">{formatMoney(client.totalSpent)}</p>
                      </div>
                      <div className="min-w-0 rounded-xl bg-[#fcfaf7] p-3">
                        <p className="text-[11px] text-gray-500">Última compra</p>
                        <p className="mt-1 text-sm font-black text-gray-900">{formatDate(client.lastOrderDate)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <AdminButton variant="filter" aria-expanded={opened} aria-controls={panelId}
                        onClick={() => setExpanded(current => current === client.key ? null : client.key)}>
                        <ReceiptText size={16} /> {opened ? "Fechar histórico" : "Ver histórico"} <ChevronDown size={15} className={opened ? "rotate-180" : ""} />
                      </AdminButton>
                      <Link href="/admin/pontos"
                        className="admin-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-800 hover:bg-orange-100">
                        <Coins size={16} /> Adicionar pontos <ArrowUpRight size={14} />
                      </Link>
                      <button type="button"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
                        onClick={() => window.open("https://wa.me/55" + normalizeCustomerPhone(client.phone), "_blank", "noopener,noreferrer")}>
                        <MessageCircle size={16} /> Abrir WhatsApp
                      </button>
                    </div>
                  </div>

                  {opened ? (
                    <section id={panelId} aria-label={"Histórico de " + client.name}
                      className="grid gap-4 border-t border-[var(--line)] bg-[#fcfaf7] p-4 lg:grid-cols-2 lg:p-5">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-sm font-black text-gray-950"><ShoppingBag size={17} /> Últimos pedidos</h3>
                        <p className="mt-1 text-xs text-gray-500">Até cinco pedidos mais recentes, sem cancelados ou testes.</p>
                        {client.recentOrders.length === 0 ? <p className="mt-4 text-sm text-gray-500">Ainda não há pedidos associados a este telefone.</p> : (
                          <div className="mt-3 space-y-2">
                            {client.recentOrders.map(order => (
                              <div key={order.id} className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <strong className="text-gray-950">Pedido #{order.displayNumber || order.id.slice(0, 6)}</strong>
                                  <span className="font-black text-gray-900">{formatMoney(order.total)}</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">{formatDateTime(order.createdAt)} · {order.status === "done" ? "Concluído" : "Em andamento"}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-sm font-black text-gray-950"><Wallet size={17} /> Histórico de fidelidade</h3>
                        <p className="mt-1 text-xs text-gray-500">Pontos acumulados: {client.lifetimeEarned.toLocaleString("pt-BR")}. Até cinco movimentações recentes.</p>
                        {client.recentTransactions.length === 0 ? <p className="mt-4 text-sm text-gray-500">Ainda não há movimentações de pontos.</p> : (
                          <div className="mt-3 space-y-2">
                            {client.recentTransactions.map(tx => (
                              <div key={tx.id} className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <strong className="min-w-0 break-words text-gray-900">{tx.description || (tx.points >= 0 ? "Pontos recebidos" : "Pontos utilizados")}</strong>
                                  <span className={"font-black tabular-nums " + (tx.points >= 0 ? "text-emerald-700" : "text-red-700")}>
                                    {tx.points >= 0 ? "+" : ""}{tx.points} pts
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">{formatDateTime(tx.createdAt)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {client.addresses.length > 0 ? (
                        <div className="min-w-0 lg:col-span-2">
                          <h3 className="text-sm font-black text-gray-950">Endereços utilizados</h3>
                          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                            {client.addresses.map(address => (
                              <li key={address} className="min-w-0 break-words rounded-xl border border-[var(--line)] bg-white p-3 text-sm text-gray-700">{address}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm text-gray-600">
          <p>{visible.length.toLocaleString("pt-BR")} clientes · Página {page} de {pages}</p>
          {visible.length > PER_PAGE ? (
            <div className="flex gap-2">
              <AdminButton variant="secondary" disabled={page <= 1} onClick={() => { setPage(n => Math.max(1, n - 1)); setExpanded(null); }}>
                <ChevronLeft size={16} /> Anterior
              </AdminButton>
              <AdminButton variant="secondary" disabled={page >= pages} onClick={() => { setPage(n => Math.min(pages, n + 1)); setExpanded(null); }}>
                Próxima <ChevronRight size={16} />
              </AdminButton>
            </div>
          ) : null}
        </div>
      </section>
      <p className="text-xs leading-5 text-gray-500">
        Inatividade considera 30 dias desde a última compra concluída. Pedidos cancelados e de teste não entram na contagem.
        Mensagens ao cliente só são abertas pelo operador; não há disparo automático.
      </p>
    </AdminPageShell>
  );
}
