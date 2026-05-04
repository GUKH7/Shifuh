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

type Client = {
  phone: string;
  name: string;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: string;
  address: string;
};

const PAGE_SIZE = 10;

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR");
}

function exportClients(rows: Client[]) {
  const header = ["Cliente", "Telefone", "Pedidos", "Total gasto", "Última compra", "Endereço"];
  const lines = rows.map((client) => [
    client.name,
    client.phone,
    client.orderCount,
    client.totalSpent.toFixed(2),
    formatDate(client.lastOrderDate),
    client.address,
  ]);

  const csv = [header, ...lines]
    .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "clientes.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function ClientsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white" />
        <div className="space-y-3">
          <div className="h-6 w-40 rounded-full bg-white" />
          <div className="h-4 w-72 rounded-full bg-white" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="surface-card rounded-[24px] p-5">
            <div className="h-4 w-24 rounded-full bg-white" />
            <div className="mt-4 h-8 w-24 rounded-full bg-white" />
          </div>
        ))}
      </div>
      <div className="surface-card mt-6 rounded-[28px] p-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="mt-3 h-16 rounded-2xl bg-white first:mt-0" />
        ))}
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchClients = async () => {
    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user) return router.push("/admin/login");
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

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const grouped = new Map<string, Client>();

      (data || []).forEach((order: any) => {
        const phone = order.customer_phone;
        if (!phone) return;

        const current = grouped.get(phone);
        const address = order.address
        ? `${order.address.street || "Rua não informada"}, ${order.address.number || "S/N"} - ${order.address.neighborhood || "Sem bairro"}`
          : "Retirada";

        if (!current) {
          grouped.set(phone, {
            phone,
            name: order.customer_name || "Cliente",
            totalSpent: Number(order.total || 0),
            orderCount: 1,
            lastOrderDate: order.created_at,
            address,
          });
          return;
        }

        grouped.set(phone, {
          ...current,
          totalSpent: current.totalSpent + Number(order.total || 0),
          orderCount: current.orderCount + 1,
        });
      });

      setClients(Array.from(grouped.values()).sort((a, b) => b.totalSpent - a.totalSpent));
    } catch (error) {
      console.error(error);
      setErrorMsg("Erro ao carregar os clientes.");
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;

    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(term) ||
        client.phone.toLowerCase().includes(term),
    );
  }, [clients, search]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const paginatedClients = filteredClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    const totalRevenue = clients.reduce((sum, client) => sum + client.totalSpent, 0);
    const totalOrders = clients.reduce((sum, client) => sum + client.orderCount, 0);
    return {
      totalRevenue,
      totalOrders,
    };
  }, [clients]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  if (loading) return <ClientsSkeleton />;

  if (errorMsg) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-red-700">
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-950">Clientes</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Veja quem mais compra, quanto gastou e acione o WhatsApp em um clique.
            </p>
          </div>
        </div>
        <button
          onClick={() => exportClients(filteredClients)}
          className="inline-flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700"
        >
          <Download size={16} />
          Exportar
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Base ativa</p>
          <p className="mt-3 text-3xl font-black text-gray-950">{clients.length}</p>
        </div>
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Pedidos associados</p>
          <p className="mt-3 text-3xl font-black text-gray-950">{summary.totalOrders}</p>
        </div>
        <div className="surface-card rounded-[24px] p-5">
          <p className="text-sm font-medium text-gray-500">Faturamento da base</p>
          <p className="mt-3 text-3xl font-black text-gray-950">{formatMoney(summary.totalRevenue)}</p>
        </div>
      </section>

      <section className="surface-card mt-6 rounded-[28px] p-5 md:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
          <Search size={18} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-[var(--line)] bg-white">
          <div className="grid grid-cols-[1.3fr_1fr_120px_160px_140px_110px] gap-4 border-b border-[var(--line)] px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            <span>Cliente</span>
            <span>Contato</span>
            <span>Pedidos</span>
            <span>Total gasto</span>
            <span>Última compra</span>
            <span className="text-right">Ação</span>
          </div>

          <div className="divide-y divide-[var(--line)]">
            {paginatedClients.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-gray-500">
                Nenhum cliente encontrado.
              </div>
            ) : (
              paginatedClients.map((client) => (
                <div key={client.phone} className="grid grid-cols-[1.3fr_1fr_120px_160px_140px_110px] gap-4 px-6 py-5 text-sm text-gray-700">
                  <div>
                    <p className="font-bold text-gray-950">{client.name}</p>
                    <p className="mt-1 text-xs text-gray-400">{client.address}</p>
                  </div>
                  <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#f8f3ec] px-3 py-2 text-sm font-semibold text-gray-700">
                    <Phone size={14} />
                    {client.phone}
                  </div>
                  <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#f2f7ff] px-3 py-2 font-bold text-blue-700">
                    <ShoppingBag size={14} />
                    {client.orderCount}
                  </div>
                  <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#eefaf2] px-3 py-2 font-bold text-emerald-700">
                    <Wallet size={14} />
                    {formatMoney(client.totalSpent)}
                  </div>
                  <div className="font-semibold text-gray-600">{formatDate(client.lastOrderDate)}</div>
                  <div className="text-right">
                    <button
                      onClick={() => window.open(`https://wa.me/${client.phone.replace(/\D/g, "")}`, "_blank")}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"
                    >
                      <MessageCircle size={14} />
                      WhatsApp
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {filteredClients.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-[var(--line)] px-6 py-4 text-sm text-gray-500">
              <p>
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-semibold disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Anterior
                </button>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-semibold disabled:opacity-50"
                >
                  Próxima
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
