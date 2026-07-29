from pathlib import Path

page_path = Path("src/app/admin/(painel)/orders/page.tsx")
test_path = Path("tests/orders-date-filters.test.js")

page = page_path.read_text(encoding="utf-8")

old_ref = '  const lastSeenOrderIdRef = useRef("");\n'
new_ref = '  const lastSeenOrderIdRef = useRef("");\n  const dateInputRef = useRef<HTMLInputElement>(null);\n'
if old_ref not in page:
    raise SystemExit("Não encontrou o ponto para adicionar dateInputRef")
page = page.replace(old_ref, new_ref, 1)

old_handler_anchor = '''  const selectedDateLabel = formatSelectedDateLabel(selectedDate);

  useEffect(() => {
'''
new_handler_anchor = '''  const selectedDateLabel = formatSelectedDateLabel(selectedDate);

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;

    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Alguns navegadores bloqueiam showPicker; o clique nativo abaixo serve como fallback.
    }

    input.focus();
    input.click();
  };

  useEffect(() => {
'''
if old_handler_anchor not in page:
    raise SystemExit("Não encontrou o ponto para adicionar openDatePicker")
page = page.replace(old_handler_anchor, new_handler_anchor, 1)

old_control = '''            <label
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
'''
new_control = '''            <div className="relative">
              <button
                type="button"
                onClick={openDatePicker}
                className="inline-flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition hover:border-orange-200 focus-visible:border-[var(--brand)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
                aria-label={`Escolher data dos pedidos. Data selecionada: ${selectedDateLabel}`}
              >
                <CalendarDays size={17} className="text-gray-500" />
                <span>{selectedDateLabel}</span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              <input
                ref={dateInputRef}
                id="orders-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value || formatDateInputValue())}
                className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px -translate-x-1/2 opacity-0"
                tabIndex={-1}
                aria-label="Selecionar data dos pedidos"
              />
            </div>
'''
if old_control not in page:
    raise SystemExit("Não encontrou o controle de data atual")
page = page.replace(old_control, new_control, 1)
page_path.write_text(page, encoding="utf-8")

test = test_path.read_text(encoding="utf-8")
old_test = '''test("pedidos consultam a data selecionada no banco", () => {
  assert.match(page, /type="date"/);
  assert.match(page, /getSelectedDateRange\(selectedDate\)/);
  assert.match(page, /created_at\.gte\.\$\{start\}/);
  assert.match(page, /scheduled_for\.gte\.\$\{start\}/);
});
'''
new_test = '''test("pedidos consultam a data selecionada no banco", () => {
  assert.match(page, /type="date"/);
  assert.match(page, /getSelectedDateRange\(selectedDate\)/);
  assert.match(page, /created_at\.gte\.\$\{start\}/);
  assert.match(page, /scheduled_for\.gte\.\$\{start\}/);
});

test("botão de data abre o calendário nativo de forma explícita", () => {
  assert.match(page, /const dateInputRef = useRef<HTMLInputElement>\(null\)/);
  assert.match(page, /const openDatePicker = \(\) =>/);
  assert.match(page, /input\.showPicker\(\)/);
  assert.match(page, /onClick=\{openDatePicker\}/);
  assert.match(page, /ref=\{dateInputRef\}/);
});
'''
if old_test not in test:
    raise SystemExit("Não encontrou o teste de data atual")
test = test.replace(old_test, new_test, 1)
test_path.write_text(test, encoding="utf-8")
