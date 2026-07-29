from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(content, encoding="utf-8")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)


# 1) Orders: real store status, no duplicated empty state, semantic responsive table.
orders_path = "src/app/admin/(painel)/orders/page.tsx"
orders = read(orders_path)
orders = replace_once(
    orders,
    'import { getCurrentRestaurant } from "@/lib/supabase/restaurant";\n',
    'import { getCurrentRestaurant } from "@/lib/supabase/restaurant";\nimport { getStoreStatus } from "@/features/storefront/store-summary";\n',
    "orders store status import",
)
orders = replace_once(
    orders,
    'import { OrdersDatePicker } from "./OrdersDatePicker";\n',
    'import { OrdersDatePicker } from "./OrdersDatePicker";\nimport "./orders-responsive.css";\n',
    "orders responsive css import",
)
orders = replace_once(
    orders,
    '  printer_font_weight?: number | null;\n};',
    '  printer_font_weight?: number | null;\n  work_hours?: unknown;\n};',
    "orders restaurant work hours",
)
orders = replace_once(
    orders,
    '  const [isChimeEnabled, setIsChimeEnabled] = useState(false);\n  const { showToast } = useToast();\n  const isCurrentDate = selectedDate === formatDateInputValue();\n  const selectedDateLabel = formatSelectedDateLabel(selectedDate);',
    '  const [isChimeEnabled, setIsChimeEnabled] = useState(false);\n  const [storeClock, setStoreClock] = useState(() => new Date());\n  const { showToast } = useToast();\n  const isCurrentDate = selectedDate === formatDateInputValue();\n  const selectedDateLabel = formatSelectedDateLabel(selectedDate);\n  const storeStatus = useMemo(\n    () => getStoreStatus(restaurantConfig?.work_hours, storeClock),\n    [restaurantConfig?.work_hours, storeClock],\n  );\n  const storeStatusClasses = {\n    open: "border-emerald-200 bg-emerald-50 text-emerald-700",\n    closing: "border-amber-200 bg-amber-50 text-amber-700",\n    closed: "border-red-200 bg-red-50 text-red-700",\n  }[storeStatus.tone];\n  const storeStatusDotClass = {\n    open: "text-emerald-500",\n    closing: "text-amber-500",\n    closed: "text-red-500",\n  }[storeStatus.tone];',
    "orders derived store status",
)
orders = replace_once(
    orders,
    '  useEffect(() => {\n    setIsChimeEnabled(window.localStorage.getItem("orders-chime-enabled") === "true");\n  }, []);',
    '  useEffect(() => {\n    setIsChimeEnabled(window.localStorage.getItem("orders-chime-enabled") === "true");\n  }, []);\n\n  useEffect(() => {\n    const intervalId = window.setInterval(() => setStoreClock(new Date()), 60_000);\n    return () => window.clearInterval(intervalId);\n  }, []);',
    "orders status clock",
)
orders = replace_once(
    orders,
    '''            <div className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black ${
              isCurrentDate
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-gray-50 text-gray-600"
            }`}>
              {isCurrentDate ? <LiveStatusDot /> : <CalendarDays size={16} />}
              {isCurrentDate ? "Loja aberta" : "Consulta histórica"}
            </div>''',
    '''            <div className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black ${
              isCurrentDate ? storeStatusClasses : "border-gray-200 bg-gray-50 text-gray-600"
            }`}>
              {isCurrentDate ? <LiveStatusDot className={storeStatusDotClass} /> : <CalendarDays size={16} />}
              {isCurrentDate ? `Loja ${storeStatus.label.toLowerCase()}` : "Consulta histórica"}
            </div>''',
    "orders real store status card",
)
orders = replace_once(
    orders,
    '''        <div className="flex flex-col gap-4 rounded-[18px] border border-dashed border-orange-200 bg-white px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[var(--brand)]">
              <Package size={24} />
            </span>
            <div>
              <p className="font-black text-gray-950">Não encontrou o pedido que procura?</p>
              <p className="mt-1 text-sm text-gray-500">Tente ajustar os filtros ou buscar por outro termo.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm"
          >
            <RefreshCw size={16} />
            Limpar filtros
          </button>
        </div>

''',
    '',
    "orders duplicate empty state",
)
orders = replace_once(
    orders,
    'className="hidden grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px] items-center gap-2 border-b border-[var(--line)] bg-[#fffdfa] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.06em] text-gray-400 xl:grid"',
    'className="orders-table-header hidden grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px] items-center gap-2 border-b border-[var(--line)] bg-[#fffdfa] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.06em] text-gray-400 xl:grid"',
    "orders semantic table header",
)
row_marker = '<div className="grid gap-4 px-5 py-4 xl:grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px] xl:items-center xl:gap-2 xl:px-4">'
orders = replace_once(
    orders,
    row_marker,
    '<div className="orders-table-row grid gap-4 px-5 py-4 xl:grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px] xl:items-center xl:gap-2 xl:px-4">',
    "orders semantic table row",
)
row_start = orders.index('className="orders-table-row')
row_end = orders.index('{isExpanded && (', row_start)
row_segment = orders[row_start:row_end]
cell_replacements = [
    ('<div className="text-center">', '<div className="orders-table-cell text-center" data-label="Pedido">'),
    ('<div className="min-w-0 text-center">', '<div className="orders-table-cell min-w-0 text-center" data-label="Cliente">'),
    ('<div className="flex items-center justify-center gap-2">', '<div className="orders-table-cell flex items-center justify-center gap-2" data-label="Canal">'),
    ('<div className="text-center">', '<div className="orders-table-cell text-center" data-label="Itens">'),
    ('<div className="text-center">', '<div className="orders-table-cell text-center" data-label="Valor">'),
    ('<div className="min-w-0 text-center">', '<div className="orders-table-cell min-w-0 text-center" data-label="Pagamento">'),
    ('<div className="flex justify-center">', '<div className="orders-table-cell flex justify-center" data-label="Status">'),
    ('<div className="text-center">', '<div className="orders-table-cell text-center" data-label="Horário">'),
    ('<div className="flex items-center gap-1 xl:justify-center">', '<div className="orders-table-cell orders-actions-cell flex items-center gap-1 xl:justify-center" data-label="Ações">'),
]
for old, new in cell_replacements:
    if old not in row_segment:
        raise RuntimeError(f"orders mobile cell not found: {old}")
    row_segment = row_segment.replace(old, new, 1)
orders = orders[:row_start] + row_segment + orders[row_end:]
write(orders_path, orders)

write(
    "src/app/admin/(painel)/orders/orders-responsive.css",
    '''@media (max-width: 1279px) {
  .orders-table-row {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0.875rem 1rem !important;
    margin: 0.75rem;
    padding: 1rem !important;
    border: 1px solid var(--line);
    border-radius: 1rem;
    background: #fff;
  }

  .orders-table-row > .orders-table-cell {
    min-width: 0;
    justify-content: flex-start !important;
    text-align: left !important;
  }

  .orders-table-row > .orders-table-cell::before {
    display: block;
    margin-bottom: 0.3rem;
    color: #9ca3af;
    content: attr(data-label);
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1rem;
    text-transform: uppercase;
  }

  .orders-table-row > .orders-table-cell[data-label="Canal"],
  .orders-table-row > .orders-table-cell[data-label="Status"],
  .orders-table-row > .orders-actions-cell {
    display: flex;
    flex-wrap: wrap;
  }

  .orders-table-row > .orders-table-cell[data-label="Canal"]::before,
  .orders-table-row > .orders-table-cell[data-label="Status"]::before,
  .orders-table-row > .orders-actions-cell::before {
    flex-basis: 100%;
  }

  .orders-table-row > .orders-actions-cell {
    grid-column: 1 / -1;
    gap: 0.5rem;
  }
}

@media (max-width: 639px) {
  .orders-table-row {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .orders-table-row > .orders-actions-cell {
    grid-column: auto;
  }

  .orders-table-row > .orders-actions-cell > button:first-of-type:not(:last-child) {
    flex: 1 1 auto;
  }
}
''',
)

# 2) Dashboard: stable client and actual realtime with fallback refresh.
dashboard_path = "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx"
dashboard = read(dashboard_path)
dashboard = replace_once(
    dashboard,
    '''  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );''',
    '''  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
    [],
  );''',
    "dashboard stable supabase client",
)
dashboard = replace_once(
    dashboard,
    '  const [workHours, setWorkHours] = useState<unknown>([]);\n  const [orders, setOrders] = useState<OrderRow[]>([]);',
    '  const [workHours, setWorkHours] = useState<unknown>([]);\n  const [restaurantId, setRestaurantId] = useState("");\n  const [dashboardClock, setDashboardClock] = useState(() => new Date());\n  const [orders, setOrders] = useState<OrderRow[]>([]);',
    "dashboard realtime state",
)
dashboard = replace_once(
    dashboard,
    '        setRestaurantSlug(restaurant.slug || "");\n        setWorkHours(restaurant.work_hours || []);',
    '        setRestaurantSlug(restaurant.slug || "");\n        setWorkHours(restaurant.work_hours || []);\n        setRestaurantId(restaurant.id);',
    "dashboard restaurant id",
)
dashboard = replace_once(
    dashboard,
    '  const storeStatus = useMemo(() => getStoreStatus(workHours), [workHours]);',
    '''  useEffect(() => {
    if (!restaurantId) return;

    let isRefreshing = false;
    let isMounted = true;

    const refreshOrders = async () => {
      if (isRefreshing) return;
      isRefreshing = true;

      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, customer_name, total, status, created_at, display_number, external_source, address, order_items (product_name, quantity)")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (isMounted) setOrders((data || []) as OrderRow[]);
      } catch (error) {
        console.warn("Falha ao atualizar o dashboard em tempo real:", error);
      } finally {
        isRefreshing = false;
      }
    };

    const ordersChannel = supabase
      .channel(`dashboard-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => void refreshOrders(),
      )
      .subscribe();

    const itemsChannel = supabase
      .channel(`dashboard-order-items-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => void refreshOrders(),
      )
      .subscribe();

    const intervalId = window.setInterval(() => void refreshOrders(), 15_000);
    const handleFocus = () => void refreshOrders();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshOrders();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(ordersChannel);
      void supabase.removeChannel(itemsChannel);
    };
  }, [restaurantId, supabase]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setDashboardClock(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const storeStatus = useMemo(
    () => getStoreStatus(workHours, dashboardClock),
    [dashboardClock, workHours],
  );''',
    "dashboard realtime effects",
)
write(dashboard_path, dashboard)

# 3) Storefront delivery copy: missing configuration is not free delivery.
storefront_path = "src/app/[slug]/page.tsx"
storefront = read(storefront_path)
storefront = replace_once(
    storefront,
    '''  const deliveryFeeLabel = hasFreeDelivery || deliveryTiers.length === 0
    ? "Entrega grátis"
    : `Entrega a partir de ${formatMoney(startingDeliveryFee)}`;''',
    '''  const deliveryFeeLabel = deliveryTiers.length === 0
    ? "Taxa a consultar"
    : hasFreeDelivery
      ? "Entrega grátis"
      : `Entrega a partir de ${formatMoney(startingDeliveryFee)}`;''',
    "storefront delivery fee copy",
)
write(storefront_path, storefront)

# 4) Admin header: hide unfinished help and notifications affordances.
layout_path = "src/app/admin/(painel)/layout.tsx"
layout = read(layout_path)
layout = replace_once(
    layout,
    'import { Bell, HelpCircle, Menu, Search } from "lucide-react";',
    'import { Menu, Search } from "lucide-react";',
    "layout icon imports",
)
layout = replace_once(
    layout,
    '''            <div className="admin-page-shell grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <AdminSkeleton className="h-10 w-10 lg:hidden" />
              <AdminSkeleton className="h-11 w-full max-w-2xl justify-self-start" />
              <div className="flex gap-2">
                <AdminSkeleton className="h-10 w-10" />
                <AdminSkeleton className="h-10 w-10" />
              </div>
            </div>''',
    '''            <div className="admin-page-shell grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 lg:grid-cols-1">
              <AdminSkeleton className="h-10 w-10 lg:hidden" />
              <AdminSkeleton className="h-11 w-full max-w-2xl justify-self-start" />
            </div>''',
    "layout guard skeleton actions",
)
layout = replace_once(
    layout,
    '''  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );''',
    '''  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
    [],
  );''',
    "layout stable supabase client",
)
layout = replace_once(
    layout,
    '            <div className="admin-page-shell grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">',
    '            <div className="admin-page-shell grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:gap-3 lg:grid-cols-1">',
    "layout header grid",
)
layout = replace_once(
    layout,
    '''
              <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-2.5">
                <button
                  type="button"
                  aria-label="Ajuda"
                  className="surface-card hidden h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:text-gray-950 sm:inline-flex"
                >
                  <HelpCircle size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Notificações"
                  className="surface-card inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:text-gray-950"
                >
                  <Bell size={17} />
                </button>
              </div>''',
    '',
    "layout unfinished header actions",
)
write(layout_path, layout)

# 5) Regression tests for the six priority-one fixes.
write(
    "tests/priority-one-operational-trust.test.js",
    '''const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const orders = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");
const ordersResponsive = fs.readFileSync("src/app/admin/(painel)/orders/orders-responsive.css", "utf8");
const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const storefront = fs.readFileSync("src/app/[slug]/page.tsx", "utf8");
const layout = fs.readFileSync("src/app/admin/(painel)/layout.tsx", "utf8");

test("pedidos exibem apenas um estado vazio", () => {
  const matches = orders.match(/Não encontrou o pedido que procura\?/g) || [];
  assert.equal(matches.length, 1);
});

test("pedidos usam o horário real da loja", () => {
  assert.match(orders, /getStoreStatus\(restaurantConfig\?\.work_hours, storeClock\)/);
  assert.match(orders, /storeStatus\.label\.toLowerCase\(\)/);
  assert.match(orders, /storeStatusClasses/);
});

test("dashboard atualiza por realtime e contingência", () => {
  assert.match(dashboard, /dashboard-orders-\$\{restaurantId\}/);
  assert.match(dashboard, /postgres_changes/);
  assert.match(dashboard, /setInterval\(\(\) => void refreshOrders\(\), 15_000\)/);
  assert.match(dashboard, /visibilitychange/);
  assert.match(dashboard, /window\.addEventListener\("focus"/);
});

test("tabela de pedidos possui estrutura móvel semântica", () => {
  assert.match(orders, /orders-table-row/);
  assert.match(orders, /data-label="Pedido"/);
  assert.match(orders, /data-label="Ações"/);
  assert.match(ordersResponsive, /content: attr\(data-label\)/);
  assert.match(ordersResponsive, /grid-template-columns: repeat\(2/);
});

test("vitrine não chama ausência de configuração de entrega grátis", () => {
  assert.match(storefront, /deliveryTiers\.length === 0/);
  assert.match(storefront, /Taxa a consultar/);
});

test("ações de ajuda e notificações não aparecem sem implementação", () => {
  assert.doesNotMatch(layout, /aria-label="Ajuda"/);
  assert.doesNotMatch(layout, /aria-label="Notificações"/);
  assert.doesNotMatch(layout, /HelpCircle/);
  assert.doesNotMatch(layout, /\bBell\b/);
});
''',
)
