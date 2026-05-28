"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Bike,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock3,
  MapPin,
  Package,
  Printer,
  Search,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { useToast } from "@/components/ui/toast-provider";

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  status: "pending" | "preparing" | "delivering" | "done" | "canceled";
  payment_method: string;
  display_number?: number | null;
  external_source?: string | null;
  external_order_id?: string | null;
  external_display_id?: string | null;
  external_payload?: any;
  is_test?: boolean;
  created_at: string;
  address: any;
  items: any[];
  change_for?: string;
}

const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendentes" },
  { id: "preparing", label: "Em preparo" },
  { id: "delivering", label: "Em rota" },
  { id: "done", label: "Concluídos" },
] as const;

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function isToday(dateStr: string) {
  const orderDate = new Date(dateStr);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return orderDate >= start && orderDate < end;
}

function formatDisplayNumber(order: Pick<Order, "display_number" | "id">) {
  if (order.display_number) {
    return String(order.display_number).padStart(4, "0");
  }
  return order.id.slice(0, 4).toUpperCase();
}

function getStatusClasses(status: Order["status"]) {
  switch (status) {
    case "pending":
      return "bg-[#fff4dc] text-[#a56b00]";
    case "preparing":
      return "bg-[#fff2ea] text-[var(--brand)]";
    case "delivering":
      return "bg-[#eef5ff] text-[#2266d2]";
    case "done":
      return "bg-emerald-100 text-emerald-700";
    case "canceled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function getStatusLabel(status: Order["status"]) {
  switch (status) {
    case "pending":
      return "Confirmado";
    case "preparing":
      return "Em preparo";
    case "delivering":
      return "Em rota";
    case "done":
    return "Concluído";
    case "canceled":
      return "Cancelado";
    default:
      return status;
  }
}

function getIfoodMeta(order: Order) {
  return order.external_payload?.gestorDelivery || {};
}

function isIfoodOrder(order: Order) {
  return order.external_source === "ifood" && Boolean(order.external_order_id);
}

function formatDateTime(value?: string | null) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatIfoodOrderType(order: Order) {
  const meta = getIfoodMeta(order);
  const type = String(meta.orderType || "").toUpperCase();
  if (type === "TAKEOUT") return "Retirada";
  if (type === "DELIVERY") return "Entrega";
  return type || "iFood";
}

function formatIfoodTiming(order: Order) {
  const meta = getIfoodMeta(order);
  const timing = String(meta.orderTiming || "").toUpperCase();
  if (timing === "SCHEDULED") return "Agendado";
  if (timing === "IMMEDIATE") return "Imediato";
  return timing || "Timing não informado";
}

function listIfoodBenefits(order: Order) {
  const benefits = getIfoodMeta(order).benefits;
  if (!benefits?.items || !Array.isArray(benefits.items)) return [];
  return benefits.items;
}

function OrdersSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="space-y-3">
          <div className="h-8 w-32 rounded-full bg-white" />
          <div className="h-4 w-72 rounded-full bg-white" />
        </div>
        <div className="h-10 w-28 rounded-full bg-white" />
      </div>
      <div className="surface-card rounded-[28px] p-6">
        <div className="h-12 rounded-2xl bg-white" />
        <div className="mt-4 flex gap-3">
          <div className="h-10 w-24 rounded-full bg-white" />
          <div className="h-10 w-24 rounded-full bg-white" />
          <div className="h-10 w-24 rounded-full bg-white" />
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-[24px] bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeStatus, setActiveStatus] = useState<(typeof STATUS_FILTERS)[number]["id"]>("pending");
  const [query, setQuery] = useState("");
  const [restaurantConfig, setRestaurantConfig] = useState<any>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const [lastSeenOrderId, setLastSeenOrderId] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const [busyIfoodAction, setBusyIfoodAction] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurantId) return;

    const ordersChannel = supabase
      .channel(`orders-live-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT" && payload.new?.id && payload.new.id !== lastSeenOrderId) {
            setLastSeenOrderId(String(payload.new.id));
            const display = String(payload.new.display_number || 0).padStart(4, "0");
            showToast({
              title: "Novo pedido recebido",
          description: `Pedido #${display === "0000" ? String(payload.new.id).slice(0, 4) : display} entrou na fila da operação.`,
              tone: "success",
            });
          }

          await fetchOrders(false);
        },
      )
      .subscribe();

    const itemsChannel = supabase
      .channel(`order-items-live-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
        },
        async () => {
          await fetchOrders(false);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(itemsChannel);
    };
  }, [lastSeenOrderId, restaurantId, showToast, supabase]);

  useEffect(() => {
    if (!restaurantId) return;

    let isRunning = false;
    let isCancelled = false;

    const syncIfoodOrders = async () => {
      if (isRunning) return;
      isRunning = true;

      try {
        const response = await fetch("/api/integrations/ifood/orders/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ restaurantId }),
        });

        if (response.ok && !isCancelled) {
          await fetchOrders(false);
        }
      } catch (error) {
        console.warn("Falha ao sincronizar pedidos iFood automaticamente:", error);
      } finally {
        isRunning = false;
      }
    };

    syncIfoodOrders();
    const intervalId = window.setInterval(syncIfoodOrders, 10000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const fetchOrders = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { restaurant: resto, user } = await getCurrentRestaurant(supabase);
      if (!user) return router.push("/admin/login");
      if (!resto) {
        setErrorMsg("Não foi possível localizar a loja.");
        return;
      }

      setRestaurantConfig(resto);
      setRestaurantId(resto.id);

      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total, subtotal, delivery_fee, discount, status, payment_method, display_number, external_source, external_order_id, external_display_id, external_payload, is_test, created_at, address, change_for, order_items (*)")
        .eq("restaurant_id", resto.id)
        .in("status", ["pending", "preparing", "delivering", "done"])
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const mappedOrders = (data || [])
        .map((order: any) => ({
          ...order,
          items: order.order_items || [],
        }))
        .filter((order: Order) => isToday(order.created_at)) as Order[];

      setOrders(mappedOrders);

      if (mappedOrders.length > 0) {
        setLastSeenOrderId((current) => current || String(mappedOrders[0].id));
        setExpandedOrders((current) => {
          if (current.length > 0) return current;
          const firstLive = mappedOrders.find((order) => order.status !== "done");
          return firstLive ? [firstLive.id] : mappedOrders.slice(0, 1).map((order) => order.id);
        });
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro de conexão.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const updateStatus = async (order: Order, newStatus: Order["status"]) => {
    setOrders((prev) =>
      prev.map((current) => (current.id === order.id ? { ...current, status: newStatus } : current)),
    );

    const response = await fetch(`/api/orders/${order.id}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: newStatus,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      showToast({
        title: "Não foi possível atualizar o pedido",
        description: result.error || "Tente novamente em instantes.",
        tone: "error",
      });
      fetchOrders();
      return;
    }

    showToast({
      title: "Status atualizado",
      description: result.notification?.sent
        ? `Pedido #${formatDisplayNumber(order)} agora está como ${getStatusLabel(newStatus).toLowerCase()} e o cliente foi avisado.`
        : `Pedido #${formatDisplayNumber(order)} agora está como ${getStatusLabel(newStatus).toLowerCase()}.`,
      tone: "success",
    });

    if (result.notification && !result.notification.sent && !result.notification.skipped) {
      showToast({
        title: "WhatsApp não enviado",
        description: result.notification.error || "Confira a configuração da API do robô.",
        tone: "error",
      });
    }

    if (newStatus === "preparing" && restaurantConfig?.printer_auto_print) {
      setTimeout(() => handlePrint({ ...order, status: newStatus }), 150);
    }
  };

  const runIfoodAction = async (
    order: Order,
    action: "confirm" | "dispatch" | "ready_to_pickup" | "cancellation_reasons" | "request_cancellation",
    options: Record<string, any> = {},
  ) => {
    const busyKey = `${order.id}:${action}`;
    setBusyIfoodAction(busyKey);

    try {
      const response = await fetch("/api/integrations/ifood/orders/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.id,
          action,
          ...options,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível executar a ação no iFood.");
      }

      if (action === "cancellation_reasons") {
        showToast({
          title: "Motivos de cancelamento consultados",
          description: JSON.stringify(result.reasons).slice(0, 220),
          tone: "success",
        });
      } else {
        showToast({
          title: "Ação enviada ao iFood",
          description: `Pedido #${formatDisplayNumber(order)} atualizado no iFood.`,
          tone: "success",
        });
      }

      await fetchOrders(false);
      return result;
    } catch (error) {
      showToast({
        title: "Falha na ação iFood",
        description:
          error instanceof Error ? error.message : "Não foi possível executar a ação no iFood.",
        tone: "error",
      });
      return null;
    } finally {
      setBusyIfoodAction("");
    }
  };

  const handleRequestIfoodCancellation = async (order: Order) => {
    const reasonsResult = await runIfoodAction(order, "cancellation_reasons");
    const reasons = Array.isArray(reasonsResult?.reasons)
      ? reasonsResult.reasons
      : Array.isArray(reasonsResult?.reasons?.items)
        ? reasonsResult.reasons.items
        : [];
    const firstReason = reasons[0] || {};
    const code = String(firstReason.cancellationCode || firstReason.code || "");
    const description = String(firstReason.description || firstReason.reason || "Cancelamento solicitado pela loja");

    if (!code) return;

    await runIfoodAction(order, "request_cancellation", {
      cancellationCode: code,
      reason: description,
    });
  };

  const handlePrint = (order: Order) => {
    const printWindow = window.open("", "", "width=350,height=600");
    if (!printWindow) return;

    const width = restaurantConfig?.printer_width || 80;
    const fontSize = restaurantConfig?.printer_font_size || 12;
    const fontWeight = restaurantConfig?.printer_font_weight || 700;
    const createdAt = new Date(order.created_at).toLocaleString("pt-BR");
  const addressLineOne = `${order.address?.street || "Rua não informada"}, ${order.address?.number || "S/N"}`;
    const addressLineTwo = [order.address?.neighborhood, order.address?.city, order.address?.state]
      .filter(Boolean)
      .join(" - ");
    const addressZip = order.address?.zip ? `CEP: ${order.address.zip}` : "";
    const itemsHtml = order.items
      .map(
        (item) => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <span style="font-weight:${fontWeight};">${item.quantity}x ${item.product_name}</span>
            <span style="font-weight:${fontWeight};">R$ ${Number(item.price || 0).toFixed(2)}</span>
          </div>
          ${
            item.addons?.length
              ? `<div style="margin-top:4px;color:#444;">Adicionais: ${item.addons.map((addon: any) => addon.name).join(", ")}</div>`
              : ""
          }
          ${
            item.observation
              ? `<div style="margin-top:4px;font-size:${fontSize - 1}px;">Obs: ${item.observation}</div>`
              : ""
          }
        </div>
      `,
      )
      .join("");

    printWindow.document.write(`
      <html>
      <head>
        <title>Pedido #${formatDisplayNumber(order)}</title>
        <style>
          body { font-family: 'Courier New', monospace; width:${width}mm; padding:8px; font-size:${fontSize}px; color:#111; font-weight:${fontWeight}; }
          .line { border-bottom:1px dashed #000; margin:8px 0; }
          .flex { display:flex; justify-content:space-between; }
          .center { text-align:center; }
          .muted { color:#555; }
          .title { font-size:${fontSize + 2}px; font-weight:${fontWeight}; }
        </style>
      </head>
      <body>
        <div class="center title">${restaurantConfig?.name || "Delivery"}</div>
        <div class="center">Pedido #${formatDisplayNumber(order)}</div>
        <div class="center muted">${createdAt}</div>
        <div class="line"></div>
        <div><strong>Cliente:</strong> ${order.customer_name}</div>
        <div><strong>Telefone:</strong> ${order.customer_phone}</div>
        <div><strong>Status:</strong> ${getStatusLabel(order.status)}</div>
        <div><strong>Pagamento:</strong> ${order.payment_method}${order.change_for ? ` | Troco para R$ ${order.change_for}` : ""}</div>
        <div class="line"></div>
        <div><strong>Entrega</strong></div>
        <div>${addressLineOne}</div>
        ${addressLineTwo ? `<div class="muted">${addressLineTwo}</div>` : ""}
        ${addressZip ? `<div class="muted">${addressZip}</div>` : ""}
        ${order.address?.complement ? `<div class="muted">Comp.: ${order.address.complement}</div>` : ""}
        <div class="line"></div>
        <div><strong>Itens</strong></div>
        ${itemsHtml}
        <div class="line"></div>
        <div class="flex"><span>Subtotal</span><strong>R$ ${Number(order.subtotal || 0).toFixed(2)}</strong></div>
        <div class="flex"><span>Entrega</span><strong>R$ ${Number(order.delivery_fee || 0).toFixed(2)}</strong></div>
        <div class="flex"><span>Desconto</span><strong>R$ ${Number(order.discount || 0).toFixed(2)}</strong></div>
        <div class="flex"><span>Total</span><strong>R$ ${Number(order.total || 0).toFixed(2)}</strong></div>
        <div class="line"></div>
        <div class="center muted">Impresso pelo Gestor Delivery</div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus = activeStatus === "all" ? true : order.status === activeStatus;
      const displayLabel = formatDisplayNumber(order).toLowerCase();
      const matchesQuery =
        term.length === 0
          ? true
          : order.id.toLowerCase().includes(term) ||
            displayLabel.includes(term) ||
            order.customer_name.toLowerCase().includes(term) ||
            order.customer_phone.toLowerCase().includes(term);

      return matchesStatus && matchesQuery;
    });
  }, [activeStatus, orders, query]);

  const summary = useMemo(() => {
    return {
      pending: orders.filter((order) => order.status === "pending").length,
      preparing: orders.filter((order) => order.status === "preparing").length,
      delivering: orders.filter((order) => order.status === "delivering").length,
      done: orders.filter((order) => order.status === "done").length,
      count: filteredOrders.length,
      revenue: filteredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    };
  }, [filteredOrders, orders]);

  const getCount = (status: (typeof STATUS_FILTERS)[number]["id"]) =>
    status === "all" ? orders.length : orders.filter((order) => order.status === status).length;

  const toggleExpandedOrder = (orderId: string) => {
    setExpandedOrders((current) =>
      current.includes(orderId)
        ? current.filter((item) => item !== orderId)
        : [...current, orderId],
    );
  };

  if (loading) return <OrdersSkeleton />;
  if (errorMsg) return <div className="p-8 text-center text-red-600">{errorMsg}</div>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950">Pedidos</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Acompanhe apenas os pedidos de hoje, com atualização automática da operação em tempo real.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
          Loja aberta
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-5">
        <div className="surface-card rounded-[20px] p-4">
          <p className="text-sm font-medium text-gray-500">Pendentes</p>
          <p className="mt-2 text-2xl font-black text-gray-950">{summary.pending}</p>
        </div>
        <div className="surface-card rounded-[20px] p-4">
          <p className="text-sm font-medium text-gray-500">Em preparo</p>
          <p className="mt-2 text-2xl font-black text-gray-950">{summary.preparing}</p>
        </div>
        <div className="surface-card rounded-[20px] p-4">
          <p className="text-sm font-medium text-gray-500">Em rota</p>
          <p className="mt-2 text-2xl font-black text-gray-950">{summary.delivering}</p>
        </div>
        <div className="surface-card rounded-[20px] p-4">
              <p className="text-sm font-medium text-gray-500">Concluídos</p>
          <p className="mt-2 text-2xl font-black text-gray-950">{summary.done}</p>
        </div>
        <div className="surface-card rounded-[20px] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">Valor do filtro</p>
              <p className="mt-2 text-2xl font-black text-gray-950">{formatPrice(summary.revenue)}</p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff2ea] text-[var(--brand)]">
              <BellRing size={16} />
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-400">{summary.count} pedidos no painel agora</p>
        </div>
      </section>

      <div className="mt-3 flex items-center justify-end text-xs font-medium text-gray-400">
        Atualização automática ativa
      </div>

      <div className="surface-card mt-6 rounded-[28px] p-4 md:p-6">
        <div className="mb-5 rounded-[22px] border border-[var(--line)] bg-[#fcfaf7] px-4 py-4 text-sm text-gray-600">
          Esta tela mostra apenas os pedidos criados hoje. Para consultar dias anteriores, use a aba <span className="font-bold text-gray-950">Histórico</span>.
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <Search size={18} className="text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por cliente, telefone ou número do pedido"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveStatus(tab.id)}
              className={`rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors ${
                activeStatus === tab.id
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "border border-[var(--line)] bg-white text-gray-600"
              }`}
            >
              {tab.label}
              {getCount(tab.id) > 0 ? ` (${getCount(tab.id)})` : ""}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--line)] bg-white py-20 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-500">
                Nenhum pedido encontrado para este recorte.
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isExpanded = expandedOrders.includes(order.id);

              return (
                <div
                  key={order.id}
                  className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white shadow-[0_1px_2px_rgba(17,16,15,0.04)]"
                >
                  <button
                    onClick={() => toggleExpandedOrder(order.id)}
                    className="flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-[#fcfaf7] lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="rounded-xl bg-[#f8f3ec] px-3 py-2 text-sm font-black text-gray-950">
                        #{formatDisplayNumber(order)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-bold text-gray-950">{order.customer_name}</p>
                          {isIfoodOrder(order) && (
                            <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
                              iFood {order.is_test ? "TESTE" : ""}
                            </span>
                          )}
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClasses(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          {order.customer_phone}
                          {order.external_display_id ? ` • iFood #${order.external_display_id}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[#fbf7f2] px-3 py-2 text-sm font-semibold text-gray-600">
                        <Clock3 size={15} />
                        {formatDate(order.created_at)} as {formatTime(order.created_at)}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-950">{formatPrice(Number(order.total || 0))}</p>
                        <p className="text-xs text-gray-400">{order.items.length} item(ns)</p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-500">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="grid gap-6 border-t border-[var(--line)] px-5 py-5 lg:grid-cols-[1.15fr_0.85fr_240px]">
                      <div className="space-y-3">
                        {order.items?.map((item: any, index: number) => (
                          <div key={index} className="rounded-2xl bg-[#fcfaf7] p-3">
                            <div className="flex items-start gap-3">
                              <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-gray-500">
                                {item.quantity}x
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-950">{item.product_name}</p>
                                {item.addons?.length ? (
                                  <p className="mt-1 text-xs text-gray-500">
                                    {item.addons.map((addon: any) => addon.name).join(", ")}
                                  </p>
                                ) : null}
                                {item.observation ? (
                                  <p className="mt-1 text-xs font-medium text-amber-700">Obs: {item.observation}</p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-4 rounded-[22px] bg-[#fcfaf7] p-4">
                        {isIfoodOrder(order) && (
                          <div className="rounded-2xl border border-red-100 bg-white p-4 text-sm">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-400">
                              Pedido iFood
                            </p>
                            <div className="mt-3 grid gap-2 text-gray-600">
                              <div className="flex items-center justify-between gap-3">
                                <span>Tipo</span>
                                <strong className="text-gray-950">{formatIfoodOrderType(order)}</strong>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>Timing</span>
                                <strong className="text-gray-950">{formatIfoodTiming(order)}</strong>
                              </div>
                              {getIfoodMeta(order).schedule?.deliveryDateTimeStart && (
                                <div className="rounded-xl bg-[#fcfaf7] p-3">
                                  <p className="font-bold text-gray-950">Agendamento</p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {formatDateTime(getIfoodMeta(order).schedule.deliveryDateTimeStart)}
                                    {" até "}
                                    {formatDateTime(getIfoodMeta(order).schedule.deliveryDateTimeEnd)}
                                  </p>
                                </div>
                              )}
                              {getIfoodMeta(order).customerDocument && (
                                <div className="flex items-center justify-between gap-3">
                                  <span>CPF/CNPJ</span>
                                  <strong className="text-gray-950">{getIfoodMeta(order).customerDocument}</strong>
                                </div>
                              )}
                              {getIfoodMeta(order).observations && (
                                <div className="rounded-xl bg-amber-50 p-3 text-amber-800">
                                  Obs. pedido: {getIfoodMeta(order).observations}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-3">
                          <div className="mt-0.5 rounded-xl bg-white p-2 text-gray-500">
                            <MapPin size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Entrega</p>
                            <p className="mt-1 text-sm leading-6 text-gray-700">
                    {order.address?.street || "Rua não informada"}, {order.address?.number || "S/N"}
                              <br />
                              {order.address?.neighborhood || "Sem bairro"}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-2 rounded-2xl bg-white p-4 text-sm">
                          <div className="flex items-center justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span>{formatPrice(Number(order.subtotal || 0))}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-500">
                            <span>Entrega</span>
                            <span>{formatPrice(Number(order.delivery_fee || 0))}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-500">
                            <span>Desconto</span>
                            <span>{formatPrice(Number(order.discount || 0))}</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-[var(--line)] pt-2 font-black text-gray-950">
                            <span>Total</span>
                            <span>{formatPrice(Number(order.total || 0))}</span>
                          </div>
                          <p className="text-xs text-gray-400">
                            Pagamento: {order.payment_method}
                            {order.change_for ? ` • Troco para ${order.change_for}` : ""}
                          </p>
                          {isIfoodOrder(order) && (
                            <div className="mt-2 rounded-xl bg-[#fcfaf7] p-3 text-xs text-gray-500">
                              <p>
                                Tipo: {getIfoodMeta(order).payment?.methodType || "não informado"} •{" "}
                                Método: {getIfoodMeta(order).payment?.methodName || order.payment_method}
                              </p>
                              {getIfoodMeta(order).payment?.cardBrand && (
                                <p>Bandeira: {getIfoodMeta(order).payment.cardBrand}</p>
                              )}
                              {getIfoodMeta(order).payment?.changeFor && (
                                <p>
                                  Troco para:{" "}
                                  {formatPrice(Number(getIfoodMeta(order).payment.changeFor))}
                                </p>
                              )}
                              {listIfoodBenefits(order).length > 0 && (
                                <div className="mt-2">
                                  <p className="font-bold text-gray-700">Cupons/benefícios</p>
                                  {listIfoodBenefits(order).map((benefit: any, index: number) => (
                                    <p key={index}>
                                      {benefit.target ||
                                        benefit.description ||
                                        benefit.sponsorshipValues?.[0]?.name ||
                                        "Benefício"}
                                      : {formatPrice(Number(benefit.value || benefit.amount || 0))}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col justify-center gap-3">
                        <button
                          onClick={() => handlePrint(order)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-gray-600"
                        >
                          <Printer size={15} />
                          Imprimir cupom
                        </button>

                        {order.status === "pending" && (
                          <>
                            <button
                              onClick={() =>
                                isIfoodOrder(order)
                                  ? runIfoodAction(order, "confirm")
                                  : updateStatus(order, "preparing")
                              }
                              className="brand-gradient rounded-2xl px-4 py-3 font-bold text-white"
                              disabled={busyIfoodAction === `${order.id}:confirm`}
                            >
                              {busyIfoodAction === `${order.id}:confirm` ? "Enviando..." : "Aceitar pedido"}
                            </button>
                            <button
                              onClick={() =>
                                isIfoodOrder(order)
                                  ? handleRequestIfoodCancellation(order)
                                  : updateStatus(order, "canceled")
                              }
                              className="rounded-2xl border border-[var(--line)] px-4 py-3 font-semibold text-gray-500"
                              disabled={busyIfoodAction.startsWith(`${order.id}:`)}
                            >
                              Solicitar cancelamento
                            </button>
                          </>
                        )}
                        {order.status === "preparing" && (
                          <>
                            {isIfoodOrder(order) && String(getIfoodMeta(order).orderType).toUpperCase() === "TAKEOUT" ? (
                              <button
                                onClick={() => runIfoodAction(order, "ready_to_pickup")}
                                className="rounded-2xl bg-[#2f9cff] px-4 py-3 font-bold text-white"
                                disabled={busyIfoodAction === `${order.id}:ready_to_pickup`}
                              >
                                Pronto para retirada
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  isIfoodOrder(order)
                                    ? runIfoodAction(order, "dispatch")
                                    : updateStatus(order, "delivering")
                                }
                                className="rounded-2xl bg-[#2f9cff] px-4 py-3 font-bold text-white"
                                disabled={busyIfoodAction === `${order.id}:dispatch`}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <Bike size={16} />
                                  Despachar pedido
                                </span>
                              </button>
                            )}
                            {isIfoodOrder(order) && (
                              <button
                                onClick={() => runIfoodAction(order, "cancellation_reasons")}
                                className="rounded-2xl border border-[var(--line)] px-4 py-3 font-semibold text-gray-500"
                                disabled={busyIfoodAction === `${order.id}:cancellation_reasons`}
                              >
                                Ver motivos cancelamento
                              </button>
                            )}
                          </>
                        )}
                        {order.status === "delivering" && (
                          <button
                            onClick={() => updateStatus(order, "done")}
                            className="rounded-2xl bg-emerald-600 px-4 py-3 font-bold text-white"
                          >
                            <span className="inline-flex items-center gap-2">
                              <CheckCircle size={16} />
                                Marcar concluído
                            </span>
                          </button>
                        )}
                        {order.status === "done" && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-700">
                            Pedido finalizado
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
