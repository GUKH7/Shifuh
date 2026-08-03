"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MessageCircle,
  Phone,
  Search,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
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

type Client = {
  phone: string;
  name: string;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: string;
  addresses: string[];
};

type ClientSortKey = "name" | "phone" | "orderCount" | "totalSpent" | "lastOrderDate";

const PAGE_SIZE = 10;

const SORT_OPTIONS: Array<{ value: ClientSortKey; label: string }> = [
  { value: "name", label: "Cliente" },
  { value: "phone", label: "Contato" },
  { value: "orderCount", label: "Pedidos" },
  { value: "totalSpent", label: "Total gasto" },
  { value: "lastOrderDate", label: "Última compra" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatClientAddress(address: any) {
  if (!address?.street) return null;
  const street = `${address.street}, ${address.number || "S/N"}`;
  const district = address.neighborhood || "Bairro não informado";
  const city = [address.city, address.state].filter(Boolean).join("/");
  const complement = address.complement ? ` · ${address.complement}` : "";
  const cep = address.cep ? ` · CEP ${address.cep}` : "";
  return `${street} - ${district}${city ? ` - ${city}` : ""}${complement}${cep}`;
}

function getSortValue(client: Client, key: ClientSortKey) {
  if (key === "name") return client.name.toLocaleLowerCase("pt-BR");
  if (key === "phone") return client.phone;
  if (key === "orderCount") return client.orderCount;
  if (key === "totalSpent") return client.totalSpent;
  return new Date(client.lastOrderDate).getTime();
}

function exportClients(rows: Client[]) {
  const header = ["Cliente", "Telefone", "Pedidos", "Total gasto", "Última compra", "Endereço"];
  const lines = rows.map((client) => [
    client.name,
    client.phone,
    client.orderCount,
    client.totalSpent.toFixed(2),
    formatDate(client.lastOrderDate),
    client.addresses.join(" | "),
  ]);
  const worksheet = [header, ...lines]
    .map((line) => line.map((value) => String(value)).join("\t"))
    .join("\n");
  const blob = new Blob([`\uFEFF${worksheet}`], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "clientes.xls";
  anchor.click();
  URL.revokeObjectURL(url);
}

function ClientsWorkspaceSkeleton() {
  return <AdminPageSkeleton ariaLabel="Carregando clientes" metrics={3} />;
}

export default function ClientsWorkspace() {
  const router = useRouter();
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
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ClientSortKey>("totalSpent");
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchClients = async () => {
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

        const { data, error } = await supabase
          .from("orders")
          .select("customer_name, customer_phone, total, created_at, address, status")
          .eq("restaurant_id", restaurant.id)
          .neq("status", "canceled")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const grouped = new Map<string, Client>();
        (data || []).forEach((order: any) => {
          const phone = order.customer_phone;
          if (!phone) return;
          const address = formatClientAddress(order.address);
          const current = grouped.get(phone);

          if (!current) {
            grouped.set(phone, {
              phone,
              name: order.customer_name || "Cliente",
              totalSpent: Number(order.total || 0),
              orderCount: 1,
              lastOrderDate: order.created_at,
              addresses: address ? [address] : [],
            });
            return;
          }

          grouped.set(phone, {
            ...current,
            totalSpent: current.totalSpent + Number(order.total || 0),
            orderCount: current.orderCount + 1,
            addresses:
              address && !current.addresses.includes(address)
                ? [...current.addresses, address]
                : current.addresses,
          });
        });

        setClients(Array.from(grouped.values()));
      } catch (error) {
        console.error(error);
        setErrorMsg("Erro ao carregar os clientes.");
      } finally {
        setLoading(false);
      }
    };

    void fetchClients();
  }, [router, supabase]);

  const visibleClients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const direction = sortDirection === "asc" ? 1 : -1;

    return clients
      .filter(
        (client) =>
          !term ||
          client.name.toLocaleLowerCase("pt-BR").includes(term) ||
          client.phone.toLocaleLowerCase("pt-BR").includes(term) ||
          client.addresses.some((address) => address.toLocaleLowerCase("pt-BR").includes(term)),
      )
      .sort((left, right) => {
        const leftValue = getSortValue(left, sortKey);
        const rightValue = getSortValue(right, sortKey);
        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return (leftValue - rightValue) * direction;
        }
        return (
          String(leftValue).localeCompare(String(rightValue), "pt-BR", {
            numeric: true,
            sensitivity: "base",
          }) * direction
        );
      });
  }, [clients, search, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(visibleClients.length / PAGE_SIZE));
  const paginatedClients = visibleClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(
    () => ({
      totalRevenue: clients.reduce((sum, client) => sum + client.totalSpent, 0),
      totalOrders: clients.reduce((sum, client) => sum + client.orderCount, 0),
    }),
    [clients],
  );

  useEffect(() => setPage(1), [search, sortDirection, sortKey]);

  const toggleSort = (key: ClientSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "totalSpent" || key === "orderCount" || key === "lastOrderDate" ? "desc" : "asc");
  };

  if (loading) return <ClientsWorkspaceSkeleton />;

  if (errorMsg) return <AdminErrorState description={errorMsg} />;

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Clientes"
        description="Veja quem mais compra, quanto gastou e acione o WhatsApp em um clique."
        icon={<Users size={24} />}
        action={
          <AdminButton variant="secondary" onClick={() => exportClients(visibleClients)}>
            <Download size={16} />
            Exportar
          </AdminButton>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Base ativa", String(clients.length)],
          ["Pedidos associados", String(summary.totalOrders)],
          ["Faturamento da base", formatMoney(summary.totalRevenue)],
        ].map(([label, value]) => (
          <div key={label} className="surface-card rounded-[24px] border-orange-100 bg-[linear-gradient(145deg,#ffffff_0%,#fff8f3_100%)] p-5">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-3 text-3xl font-black text-gray-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="surface-card rounded-[28px] p-4 sm:p-5 md:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="relative min-w-0">
            <span className="sr-only">Buscar clientes</span>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <AdminInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, telefone ou endereço"
              className="pl-11"
            />
          </label>
          <AdminSelect value={sortKey} onChange={(event) => setSortKey(event.target.value as ClientSortKey)} className="admin-filter-control xl:hidden">
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Ordenar por {option.label}
              </option>
            ))}
          </AdminSelect>
          <AdminButton
            variant="filter"
            className="xl:hidden"
            onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
          >
            {sortDirection === "asc" ? "Crescente" : "Decrescente"}
          </AdminButton>
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-[var(--line)] bg-white">
          <div className="admin-table-header hidden grid-cols-[minmax(220px,1.3fr)_minmax(160px,1fr)_120px_160px_150px_120px] items-center gap-4 border-b border-[var(--line)] bg-[#fffdfa] px-6 py-4 xl:grid">
            <SortableTableHeader label="Cliente" active={sortKey === "name"} direction={sortKey === "name" ? sortDirection : null} onClick={() => toggleSort("name")} />
            <SortableTableHeader label="Contato" active={sortKey === "phone"} direction={sortKey === "phone" ? sortDirection : null} onClick={() => toggleSort("phone")} />
            <SortableTableHeader label="Pedidos" active={sortKey === "orderCount"} direction={sortKey === "orderCount" ? sortDirection : null} onClick={() => toggleSort("orderCount")} />
            <SortableTableHeader label="Total gasto" active={sortKey === "totalSpent"} direction={sortKey === "totalSpent" ? sortDirection : null} onClick={() => toggleSort("totalSpent")} />
            <SortableTableHeader label="Última compra" active={sortKey === "lastOrderDate"} direction={sortKey === "lastOrderDate" ? sortDirection : null} onClick={() => toggleSort("lastOrderDate")} className="justify-center" />
            <span className="text-right font-bold text-gray-400">Ação</span>
          </div>

          {paginatedClients.length === 0 ? (
            <AdminEmptyState title="Nenhum cliente encontrado" description="Revise a busca e os filtros selecionados." />
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {paginatedClients.map((client) => (
                <article key={client.phone}>
                  <div className="hidden grid-cols-[minmax(220px,1.3fr)_minmax(160px,1fr)_120px_160px_150px_120px] items-center gap-4 px-6 py-5 text-sm text-gray-700 xl:grid">
                    <ClientIdentity client={client} />
                    <PhoneBadge phone={client.phone} />
                    <OrderBadge count={client.orderCount} />
                    <SpentBadge value={client.totalSpent} />
                    <div className="text-center font-semibold text-gray-600">{formatDate(client.lastOrderDate)}</div>
                    <WhatsAppButton phone={client.phone} />
                  </div>

                  <div className="p-4 xl:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <ClientIdentity client={client} />
                      <SpentBadge value={client.totalSpent} />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <PhoneBadge phone={client.phone} />
                      <OrderBadge count={client.orderCount} />
                      <div className="rounded-xl bg-[#fcfaf7] px-3 py-2 text-sm font-semibold text-gray-600">
                        Última compra: {formatDate(client.lastOrderDate)}
                      </div>
                    </div>
                    <div className="mt-4"><WhatsAppButton phone={client.phone} full /></div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {visibleClients.length > PAGE_SIZE && (
            <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p>Página {page} de {totalPages}</p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <AdminButton variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                  <ChevronLeft size={16} /> Anterior
                </AdminButton>
                <AdminButton variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
                  Próxima <ChevronRight size={16} />
                </AdminButton>
              </div>
            </div>
          )}
        </div>
      </section>
    </AdminPageShell>
  );
}

function ClientIdentity({ client }: { client: Client }) {
  return (
    <div className="min-w-0">
      <p className="font-bold text-gray-950">{client.name}</p>
      {client.addresses.length ? (
        <div className="mt-1 text-xs text-gray-500">
          <p className="line-clamp-2">{client.addresses[0]}</p>
          {client.addresses.length > 1 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-bold text-[var(--brand)]">
                Ver mais {client.addresses.length - 1} {client.addresses.length === 2 ? "endereço" : "endereços"}
              </summary>
              <ul className="mt-2 space-y-2 border-l-2 border-orange-100 pl-3 text-gray-500">
                {client.addresses.slice(1).map((address) => <li key={address}>{address}</li>)}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <p className="mt-1 text-xs text-gray-400">Pedido para retirada</p>
      )}
    </div>
  );
}

function PhoneBadge({ phone }: { phone: string }) {
  return <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#f8f3ec] px-3 py-2 text-sm font-semibold text-gray-700"><Phone size={14} />{phone}</div>;
}

function OrderBadge({ count }: { count: number }) {
  return <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#f2f7ff] px-3 py-2 font-bold text-blue-700"><ShoppingBag size={14} />{count}</div>;
}

function SpentBadge({ value }: { value: number }) {
  return <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#eefaf2] px-3 py-2 font-bold text-emerald-700"><Wallet size={14} />{formatMoney(value)}</div>;
}

function WhatsAppButton({ phone, full = false }: { phone: string; full?: boolean }) {
  return (
    <AdminButton
      variant="secondary"
      className={`${full ? "w-full" : "ml-auto"} border-emerald-200 !bg-emerald-50 text-emerald-700 shadow-sm hover:!bg-emerald-100`}
      onClick={() => window.open(`https://wa.me/${phone.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer")}
    >
      <MessageCircle size={14} /> WhatsApp
    </AdminButton>
  );
}
