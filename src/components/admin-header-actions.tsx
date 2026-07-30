"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Clock3,
  Loader2,
  RefreshCw,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

type OpenPanel = "help" | "notifications" | null;
type NotificationStatus = "pending" | "preparing" | "delivering" | "done" | "canceled";

type OrderNotification = {
  id: string;
  customer_name: string | null;
  total: number | null;
  status: NotificationStatus;
  created_at: string;
  display_number: number | null;
  external_source: string | null;
};

type HelpItem = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

const HELP_ITEMS: HelpItem[] = [
  {
    title: "Acompanhar pedidos",
    description: "Veja a fila, altere status e acompanhe novos pedidos.",
    href: "/admin/orders",
    icon: ShoppingBag,
  },
  {
    title: "Organizar o cardápio",
    description: "Crie produtos, categorias e controle a disponibilidade.",
    href: "/admin/menu",
    icon: Utensils,
  },
  {
    title: "Configurar a operação",
    description: "Ajuste horários, entrega, impressão e integrações.",
    href: "/admin/settings",
    icon: Settings,
  },
  {
    title: "Consultar o histórico",
    description: "Localize pedidos antigos e revise resultados da loja.",
    href: "/admin/history",
    icon: BookOpen,
  },
];

const STATUS_META: Record<NotificationStatus, { label: string; className: string }> = {
  pending: { label: "Novo pedido", className: "bg-orange-50 text-orange-700" },
  preparing: { label: "Em preparo", className: "bg-blue-50 text-blue-700" },
  delivering: { label: "Em rota", className: "bg-violet-50 text-violet-700" },
  done: { label: "Concluído", className: "bg-emerald-50 text-emerald-700" },
  canceled: { label: "Cancelado", className: "bg-red-50 text-red-700" },
};

function formatMoney(value: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatOrderNumber(order: OrderNotification) {
  const displayNumber = Number(order.display_number || 0);
  return displayNumber > 0 ? String(displayNumber).padStart(4, "0") : order.id.slice(0, 4).toUpperCase();
}

function formatRelativeTime(dateValue: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(dateValue).getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Agora";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} h`;
  return new Date(dateValue).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function getSeenStorageKey(restaurantId: string) {
  return `gestor-delivery:notifications-seen:${restaurantId}`;
}

export function AdminHeaderActions() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notificationError, setNotificationError] = useState("");

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const loadNotifications = useCallback(
    async (targetRestaurantId: string, showLoading = false) => {
      if (!targetRestaurantId) return;
      if (showLoading) setIsLoading(true);

      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, customer_name, total, status, created_at, display_number, external_source")
          .eq("restaurant_id", targetRestaurantId)
          .in("status", ["pending", "preparing", "delivering", "done", "canceled"])
          .order("created_at", { ascending: false })
          .limit(8);

        if (error) throw error;

        const nextNotifications = (data || []) as OrderNotification[];
        const lastSeenAt = window.localStorage.getItem(getSeenStorageKey(targetRestaurantId));
        const lastSeenTimestamp = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;

        setNotifications(nextNotifications);
        setUnreadCount(
          nextNotifications.filter((notification) => new Date(notification.created_at).getTime() > lastSeenTimestamp)
            .length,
        );
        setNotificationError("");
      } catch (error) {
        console.error("Erro ao carregar notificações do painel:", error);
        setNotificationError("Não foi possível carregar as notificações agora.");
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const { restaurant } = await getCurrentRestaurant(supabase);
        if (!isMounted || !restaurant) return;
        setRestaurantId(restaurant.id);
        await loadNotifications(restaurant.id, true);
      } catch (error) {
        console.error("Erro ao iniciar notificações do painel:", error);
        if (isMounted) {
          setNotificationError("Não foi possível carregar as notificações agora.");
          setIsLoading(false);
        }
      }
    };

    void initialize();
    return () => {
      isMounted = false;
    };
  }, [loadNotifications, supabase]);

  useEffect(() => {
    if (!restaurantId) return;

    const refresh = () => void loadNotifications(restaurantId);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const channel = supabase
      .channel(`admin-header-notifications-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        refresh,
      )
      .subscribe();

    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, restaurantId, supabase]);

  useEffect(() => {
    if (!openPanel) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpenPanel(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPanel(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  useEffect(() => {
    if (openPanel !== "notifications" || !restaurantId) return;

    const timeoutId = window.setTimeout(() => {
      window.localStorage.setItem(getSeenStorageKey(restaurantId), new Date().toISOString());
      setUnreadCount(0);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [notifications, openPanel, restaurantId]);

  const navigateTo = (href: string) => {
    setOpenPanel(null);
    router.push(href);
  };

  const activeOrdersCount = notifications.filter((notification) =>
    ["pending", "preparing", "delivering"].includes(notification.status),
  ).length;

  return (
    <div ref={containerRef} className="relative col-start-3 flex shrink-0 items-center justify-end gap-2 sm:gap-2.5">
      <button
        type="button"
        aria-label="Ajuda"
        aria-haspopup="dialog"
        aria-expanded={openPanel === "help"}
        aria-controls="admin-help-panel"
        onClick={() => setOpenPanel((current) => (current === "help" ? null : "help"))}
        className={`surface-card inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
          openPanel === "help" ? "text-[var(--brand)] ring-2 ring-orange-100" : "text-gray-500 hover:text-gray-950"
        }`}
      >
        <CircleHelp size={18} />
      </button>

      <button
        type="button"
        aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
        aria-haspopup="dialog"
        aria-expanded={openPanel === "notifications"}
        aria-controls="admin-notifications-panel"
        onClick={() => setOpenPanel((current) => (current === "notifications" ? null : "notifications"))}
        className={`surface-card relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
          openPanel === "notifications"
            ? "text-[var(--brand)] ring-2 ring-orange-100"
            : "text-gray-500 hover:text-gray-950"
        }`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#fbf7f2] bg-[var(--brand)] px-1 text-[10px] font-black leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {openPanel === "help" && (
        <section
          id="admin-help-panel"
          role="dialog"
          aria-label="Ajuda do painel"
          className="absolute right-0 top-[calc(100%+12px)] z-[70] w-[360px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[0_24px_70px_rgba(49,34,23,0.18)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[#fffdfa] px-5 py-4">
            <div>
              <div className="flex items-center gap-2 text-[var(--brand)]">
                <CircleHelp size={18} />
                <p className="text-xs font-black uppercase tracking-[0.14em]">Ajuda rápida</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Escolha uma tarefa para ir diretamente à área correta do sistema.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenPanel(null)}
              aria-label="Fechar ajuda"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-white hover:text-gray-700"
            >
              <X size={17} />
            </button>
          </div>

          <div className="grid gap-2 p-3">
            {HELP_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigateTo(item.href)}
                  className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-[#fbf7f2]"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[var(--brand)]">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-gray-950">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-gray-500">{item.description}</span>
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-gray-300 transition group-hover:text-[var(--brand)]" />
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-3 border-t border-[var(--line)] bg-[#fffdfa] px-5 py-4">
            <SlidersHorizontal size={17} className="mt-0.5 shrink-0 text-gray-400" />
            <p className="text-xs leading-5 text-gray-500">
              Use a pesquisa do topo para localizar rapidamente qualquer página do painel.
            </p>
          </div>
        </section>
      )}

      {openPanel === "notifications" && (
        <section
          id="admin-notifications-panel"
          role="dialog"
          aria-label="Notificações da operação"
          className="absolute right-0 top-[calc(100%+12px)] z-[70] w-[390px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[0_24px_70px_rgba(49,34,23,0.18)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[#fffdfa] px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-[var(--brand)]" />
                <h2 className="font-black text-gray-950">Notificações</h2>
                {activeOrdersCount > 0 && (
                  <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700">
                    {activeOrdersCount} em andamento
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">Pedidos recentes e pendências da operação.</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void loadNotifications(restaurantId, true)}
                disabled={isLoading || !restaurantId}
                aria-label="Atualizar notificações"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setOpenPanel(null)}
                aria-label="Fechar notificações"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-white hover:text-gray-700"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {isLoading ? (
              <div className="space-y-2 p-2" role="status" aria-label="Carregando notificações">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex animate-pulse gap-3 rounded-2xl px-3 py-3">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-[#eee6de]" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 w-2/3 rounded bg-[#eee6de]" />
                      <div className="h-3 w-full rounded bg-[#f4ede7]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notificationError ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-bold text-gray-700">{notificationError}</p>
                <button
                  type="button"
                  onClick={() => void loadNotifications(restaurantId, true)}
                  className="mt-4 rounded-xl border border-[var(--line)] px-4 py-2 text-xs font-black text-gray-600"
                >
                  Tentar novamente
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[var(--brand)]">
                  <Bell size={21} />
                </span>
                <p className="mt-4 font-black text-gray-950">Tudo tranquilo por aqui</p>
                <p className="mt-1 text-sm leading-6 text-gray-500">Novos pedidos aparecerão neste espaço.</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const statusMeta = STATUS_META[notification.status];
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => navigateTo("/admin/orders")}
                    className="group flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-[#fbf7f2]"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[var(--brand)]">
                      <ShoppingBag size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-black text-gray-950">
                          Pedido #{formatOrderNumber(notification)}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-gray-400">
                          <Clock3 size={11} />
                          {formatRelativeTime(notification.created_at)}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-gray-500">
                        {notification.customer_name || "Cliente"} · {formatMoney(notification.total)}
                      </span>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </span>
                    <ChevronRight size={16} className="mt-2 shrink-0 text-gray-300 transition group-hover:text-[var(--brand)]" />
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => navigateTo("/admin/orders")}
            className="flex w-full items-center justify-center gap-2 border-t border-[var(--line)] bg-[#fffdfa] px-5 py-3.5 text-sm font-black text-[var(--brand)] hover:bg-orange-50"
          >
            Ver todos os pedidos
            <ChevronRight size={16} />
          </button>
        </section>
      )}
    </div>
  );
}
