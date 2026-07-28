from pathlib import Path
import re

page_path = Path('src/app/admin/(painel)/orders/page.tsx')
source = page_path.read_text(encoding='utf-8')


def replace_once(before: str, after: str, label: str) -> None:
    global source
    if before not in source:
        raise SystemExit(f'missing replacement target: {label}')
    source = source.replace(before, after, 1)


def replace_count(before: str, after: str, expected: int, label: str) -> None:
    global source
    count = source.count(before)
    if count != expected:
        raise SystemExit(f'unexpected replacement count for {label}: {count} != {expected}')
    source = source.replace(before, after)

replace_once(
'''type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];
type IfoodAction =''',
'''type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];
type ChannelFilter = "all" | "ifood" | "whatsapp" | "counter";
type FulfillmentFilter = "all" | "delivery" | "pickup";
type IfoodAction =''',
'filter types',
)

replace_once(
'''function getChannelLabel(order: Order) {''',
'''function formatDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function getSelectedDateRange(dateValue: string) {
  const startDate = new Date(`${dateValue}T00:00:00`);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function formatSelectedDateLabel(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const today = formatDateInputValue();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = formatDateInputValue(yesterdayDate);
  const shortDate = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  if (dateValue === today) return `Hoje, ${shortDate}`;
  if (dateValue === yesterday) return `Ontem, ${shortDate}`;

  return date
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
    .replace(".", "");
}

function getChannelLabel(order: Order) {''',
'date helpers',
)

replace_once('''  if (formatIfoodOrderType(order) === "Retirada") return "Balcao";''', '''  if (formatIfoodOrderType(order) === "Retirada") return "Balcão";''', 'counter label')

replace_once(
'''  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [restaurantConfig, setRestaurantConfig] = useState<RestaurantConfig | null>(null);''',
'''  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => formatDateInputValue());
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [restaurantConfig, setRestaurantConfig] = useState<RestaurantConfig | null>(null);''',
'filter state',
)

replace_once(
'''  const { showToast } = useToast();

  useEffect(() => {
    void fetchOrders();
    setIsChimeEnabled(window.localStorage.getItem("orders-chime-enabled") === "true");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);''',
'''  const { showToast } = useToast();
  const isCurrentDate = selectedDate === formatDateInputValue();
  const selectedDateLabel = formatSelectedDateLabel(selectedDate);

  useEffect(() => {
    setIsChimeEnabled(window.localStorage.getItem("orders-chime-enabled") === "true");
  }, []);

  useEffect(() => {
    setExpandedOrders([]);
    setExpandedTechnicalOrders([]);
    void fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);''',
'date loading effect',
)

replace_once(
'''  useEffect(() => {
    if (!restaurantId) return;

    const ordersChannel = supabase''',
'''  useEffect(() => {
    if (!restaurantId || !isCurrentDate) return;

    const ordersChannel = supabase''',
'realtime current date guard',
)

replace_once(
'''  }, [isChimeEnabled, lastSeenOrderId, restaurantId, showToast, supabase]);''',
'''  }, [isChimeEnabled, isCurrentDate, lastSeenOrderId, restaurantId, showToast, supabase]);''',
'realtime dependencies',
)

replace_once(
'''  useEffect(() => {
    if (!restaurantId) return;

    let isRunning = false;''',
'''  useEffect(() => {
    if (!restaurantId || !isCurrentDate) return;

    let isRunning = false;''',
'ifood current date guard',
)

replace_once(
'''    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);''',
'''    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentDate, restaurantId]);''',
'ifood dependencies',
)

replace_once(
'''      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total, subtotal, delivery_fee, discount, status, payment_method, display_number, external_source, external_order_id, external_display_id, external_payload, is_test, scheduled_for, created_at, address, change_for, order_items (*)")
        .eq("restaurant_id", resto.id)
        .in("status", ["pending", "preparing", "delivering", "done", "canceled"])
        .order("created_at", { ascending: false });''',
'''      const { start, end } = getSelectedDateRange(selectedDate);
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total, subtotal, delivery_fee, discount, status, payment_method, display_number, external_source, external_order_id, external_display_id, external_payload, is_test, scheduled_for, created_at, address, change_for, order_items (*)")
        .eq("restaurant_id", resto.id)
        .in("status", ["pending", "preparing", "delivering", "done", "canceled"])
        .or(`and(created_at.gte.${start},created_at.lt.${end}),and(scheduled_for.gte.${start},scheduled_for.lt.${end})`)
        .order("created_at", { ascending: false });''',
'date range query',
)

replace_once(
'''      const mappedOrders = ((data || []) as OrderRow[])
        .map((order) => ({
          ...order,
          items: order.order_items || [],
        }))
        .filter((order: Order) => isToday(order.created_at) || Boolean(order.scheduled_for && isToday(order.scheduled_for))) as Order[];''',
'''      const mappedOrders = ((data || []) as OrderRow[]).map((order) => ({
        ...order,
        items: order.order_items || [],
      })) as Order[];''',
'remove today-only client filter',
)

memo_pattern = re.compile(r'''  const filteredOrders = useMemo\(\(\) => \{[\s\S]*?  const getCount = \(status: StatusFilter\) =>\n    status === "all" \? orders\.length : orders\.filter\(\(order\) => order\.status === status\)\.length;''')
memo_replacement = '''  const paymentOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((order) => formatIfoodPayment(order)).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right, "pt-BR"),
      ),
    [orders],
  );

  const baseFilteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase();

    return orders.filter((order) => {
      const displayLabel = formatDisplayNumber(order).toLowerCase();
      const itemNames = order.items.map((item) => item.product_name || item.name || "").join(" ").toLowerCase();
      const channelLabel = getChannelLabel(order);
      const fulfillmentLabel = getFulfillmentLabel(order);
      const paymentLabel = formatIfoodPayment(order);
      const matchesQuery =
        term.length === 0
          ? true
          : order.id.toLowerCase().includes(term) ||
            displayLabel.includes(term) ||
            order.customer_name.toLowerCase().includes(term) ||
            order.customer_phone.toLowerCase().includes(term) ||
            itemNames.includes(term) ||
            channelLabel.toLowerCase().includes(term) ||
            paymentLabel.toLowerCase().includes(term);
      const matchesChannel =
        channelFilter === "all" ||
        (channelFilter === "ifood" && channelLabel === "iFood") ||
        (channelFilter === "whatsapp" && channelLabel === "WhatsApp") ||
        (channelFilter === "counter" && channelLabel === "Balcão");
      const matchesFulfillment =
        fulfillmentFilter === "all" ||
        (fulfillmentFilter === "pickup" && fulfillmentLabel === "Retirada") ||
        (fulfillmentFilter === "delivery" && fulfillmentLabel === "Delivery");
      const matchesPayment = paymentFilter === "all" || paymentLabel === paymentFilter;

      return matchesQuery && matchesChannel && matchesFulfillment && matchesPayment;
    });
  }, [channelFilter, fulfillmentFilter, orders, paymentFilter, query]);

  const filteredOrders = useMemo(() => {
    return baseFilteredOrders
      .filter((order) => (activeStatus === "all" ? true : order.status === activeStatus))
      .sort((a, b) => {
        const priority: Record<OrderStatus, number> = {
          pending: 0,
          preparing: 1,
          delivering: 2,
          done: 3,
          canceled: 4,
        };

        return priority[a.status] - priority[b.status] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [activeStatus, baseFilteredOrders]);

  const summary = useMemo(() => {
    const billableOrders = orders.filter((order) => order.status !== "canceled");
    const revenue = billableOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const completedOrders = orders.filter((order) => order.status === "done").length;

    return {
      pending: orders.filter((order) => order.status === "pending").length,
      preparing: orders.filter((order) => order.status === "preparing").length,
      delivering: orders.filter((order) => order.status === "delivering").length,
      done: completedOrders,
      canceled: orders.filter((order) => order.status === "canceled").length,
      count: orders.length,
      visibleCount: filteredOrders.length,
      revenue,
      averageTicket: billableOrders.length > 0 ? revenue / billableOrders.length : 0,
    };
  }, [filteredOrders.length, orders]);

  const getCount = (status: StatusFilter) =>
    status === "all"
      ? baseFilteredOrders.length
      : baseFilteredOrders.filter((order) => order.status === status).length;

  const activeFiltersCount = [channelFilter, fulfillmentFilter, paymentFilter].filter(
    (filter) => filter !== "all",
  ).length;

  const clearAllFilters = () => {
    setQuery("");
    setActiveStatus("all");
    setChannelFilter("all");
    setFulfillmentFilter("all");
    setPaymentFilter("all");
  };'''
source, memo_count = memo_pattern.subn(memo_replacement, source, count=1)
if memo_count != 1:
    raise SystemExit(f'missing replacement target: filters memo ({memo_count})')

replace_once(
'''            <p className="mt-1 text-sm font-medium text-gray-500">
              Acompanhe e atualize os pedidos em tempo real.
            </p>''',
'''            <p className="mt-1 text-sm font-medium text-gray-500">
              {isCurrentDate
                ? "Acompanhe e atualize os pedidos em tempo real."
                : "Consulte os pedidos e resultados da data selecionada."}
            </p>''',
'page subtitle',
)

replace_once(
'''            <div className="inline-flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm font-bold text-gray-700 shadow-sm">
              <CalendarDays size={17} className="text-gray-500" />
              Hoje, {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              <ChevronDown size={16} className="text-gray-400" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700">
              <LiveStatusDot />
              Loja aberta
            </div>''',
'''            <label
              htmlFor="orders-date"
              className="relative inline-flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition hover:border-orange-200"
            >
              <CalendarDays size={17} className="text-gray-500" />
              <span>{selectedDateLabel}</span>
              <ChevronDown size={16} className="pointer-events-none text-gray-400" />
              <input
                id="orders-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value || formatDateInputValue())}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Selecionar data dos pedidos"
              />
            </label>
            <div className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black ${
              isCurrentDate
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-gray-50 text-gray-600"
            }`}>
              {isCurrentDate ? <LiveStatusDot /> : <CalendarDays size={16} />}
              {isCurrentDate ? "Loja aberta" : "Consulta histórica"}
            </div>''',
'date selector and store state',
)

replace_once(
'''                  Operação de hoje''',
'''                  {isCurrentDate ? "Operação de hoje" : "Operação da data selecionada"}''',
'operation title',
)
replace_once(
'''                  Pedidos novos entram automaticamente na fila e ficam priorizados no topo.''',
'''                  {isCurrentDate
                    ? "Pedidos novos entram automaticamente na fila e ficam priorizados no topo."
                    : `Exibindo os pedidos registrados ou agendados para ${selectedDateLabel.toLowerCase()}.`}''',
'operation description',
)

replace_once(
'''          <button
            type="button"
            onClick={enableChime}
            className={`inline-flex items-center justify-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-black shadow-sm transition ${
              isChimeEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-orange-200 bg-white text-[var(--brand)] hover:bg-orange-50"
            }`}
          >
            <BellRing size={18} />
            {isChimeEnabled ? "Campainha ativa" : "Ativar campainha"}
          </button>''',
'''          {isCurrentDate && (
            <button
              type="button"
              onClick={enableChime}
              className={`inline-flex items-center justify-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-black shadow-sm transition ${
                isChimeEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-orange-200 bg-white text-[var(--brand)] hover:bg-orange-50"
              }`}
            >
              <BellRing size={18} />
              {isChimeEnabled ? "Campainha ativa" : "Ativar campainha"}
            </button>
          )}''',
'chime current date only',
)

replace_once(
'''          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 shadow-sm">
              <Search size={18} className="text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, telefone, produto ou número do pedido..."
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm"
            >
              <Filter size={17} />
              Filtros
              <ChevronDown size={16} className="text-gray-400" />
            </button>
          </div>''',
'''          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 shadow-sm">
              <Search size={18} className="text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, telefone, produto ou número do pedido..."
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsFiltersOpen((current) => !current)}
              aria-expanded={isFiltersOpen}
              aria-controls="orders-filters-panel"
              className={`inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-bold shadow-sm transition ${
                isFiltersOpen || activeFiltersCount > 0
                  ? "border-orange-300 text-[var(--brand)]"
                  : "border-[var(--line)] text-gray-700"
              }`}
            >
              <Filter size={17} />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-[var(--brand)]">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${isFiltersOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {isFiltersOpen && (
            <div
              id="orders-filters-panel"
              className="grid gap-3 rounded-2xl border border-orange-100 bg-[#fffdfa] p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.25fr_auto] xl:items-end"
            >
              <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-gray-500">
                Canal
                <select
                  value={channelFilter}
                  onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-gray-700"
                >
                  <option value="all">Todos os canais</option>
                  <option value="ifood">iFood</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="counter">Balcão</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-gray-500">
                Atendimento
                <select
                  value={fulfillmentFilter}
                  onChange={(event) => setFulfillmentFilter(event.target.value as FulfillmentFilter)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-gray-700"
                >
                  <option value="all">Entrega e retirada</option>
                  <option value="delivery">Delivery</option>
                  <option value="pickup">Retirada</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-gray-500">
                Pagamento
                <select
                  value={paymentFilter}
                  onChange={(event) => setPaymentFilter(event.target.value)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-gray-700"
                >
                  <option value="all">Todos os pagamentos</option>
                  {paymentOptions.map((payment) => (
                    <option key={payment} value={payment}>
                      {payment}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  setChannelFilter("all");
                  setFulfillmentFilter("all");
                  setPaymentFilter("all");
                }}
                disabled={activeFiltersCount === 0}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-50"
              >
                Limpar avançados
              </button>
            </div>
          )}''',
'functional filter panel',
)

replace_count(
'''onClick={() => {
                    setQuery("");
                    setActiveStatus("all");
                  }}''',
'''onClick={clearAllFilters}''',
1,
'empty-state clear filters',
)
replace_count(
'''onClick={() => {
              setQuery("");
              setActiveStatus("all");
            }}''',
'''onClick={clearAllFilters}''',
1,
'bottom clear filters',
)

replace_once(
'''                  <p className="text-sm font-bold text-gray-500">Valor de hoje</p>''',
'''                  <p className="text-sm font-bold text-gray-500">{isCurrentDate ? "Valor de hoje" : "Valor do dia"}</p>''',
'summary value label',
)
replace_once(
'''                <p className="mt-1 text-xs font-bold text-emerald-600">Online agora</p>''',
'''                <p className="mt-1 text-xs font-bold text-emerald-600">
                  {isCurrentDate ? "Online agora" : selectedDateLabel}
                </p>''',
'summary live label',
)
replace_once(
'''                <p className="mt-1 text-xs font-bold text-gray-500">Hoje</p>''',
'''                <p className="mt-1 text-xs font-bold text-gray-500">{selectedDateLabel}</p>''',
'summary canceled date',
)
replace_once(
'''            <p className="text-xs text-gray-500 md:text-sm">Atualizado em tempo real</p>''',
'''            <p className="text-xs text-gray-500 md:text-sm">
              {isCurrentDate ? "Atualizado em tempo real" : selectedDateLabel}
            </p>''',
'summary footer date',
)

source = source.replace('''  isToday,\n''', '')

page_path.write_text(source, encoding='utf-8')

test_path = Path('tests/orders-date-filters.test.js')
test_path.write_text('''const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");

test("pedidos consultam a data selecionada no banco", () => {
  assert.match(page, /type="date"/);
  assert.match(page, /getSelectedDateRange\(selectedDate\)/);
  assert.match(page, /created_at\.gte\.\$\{start\}/);
  assert.match(page, /scheduled_for\.gte\.\$\{start\}/);
});

test("painel de filtros controla canal atendimento e pagamento", () => {
  assert.match(page, /isFiltersOpen/);
  assert.match(page, /channelFilter/);
  assert.match(page, /fulfillmentFilter/);
  assert.match(page, /paymentFilter/);
  assert.match(page, /orders-filters-panel/);
});

test("contagens por status respeitam os filtros avançados", () => {
  assert.match(page, /baseFilteredOrders/);
  assert.match(page, /activeFiltersCount/);
  assert.match(page, /clearAllFilters/);
});
''', encoding='utf-8')