from pathlib import Path

page_path = Path("src/app/admin/(painel)/orders/page.tsx")
test_path = Path("tests/orders-date-filters.test.js")

page = page_path.read_text(encoding="utf-8")

old_import = 'import { OrdersSkeleton } from "./OrdersSkeleton";\n'
new_import = 'import { OrdersSkeleton } from "./OrdersSkeleton";\nimport { OrdersDatePicker } from "./OrdersDatePicker";\n'
if old_import not in page:
    raise SystemExit("Não encontrou import de OrdersSkeleton")
page = page.replace(old_import, new_import, 1)

old_ref = '  const dateInputRef = useRef<HTMLInputElement>(null);\n'
if old_ref not in page:
    raise SystemExit("Não encontrou dateInputRef")
page = page.replace(old_ref, "", 1)

old_handler = '''  const openDatePicker = () => {
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

'''
if old_handler not in page:
    raise SystemExit("Não encontrou openDatePicker")
page = page.replace(old_handler, "", 1)

old_control = '''            <div className="relative">
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
new_control = '''            <OrdersDatePicker
              value={selectedDate}
              label={selectedDateLabel}
              onChange={setSelectedDate}
            />
'''
if old_control not in page:
    raise SystemExit("Não encontrou controle de data atual")
page = page.replace(old_control, new_control, 1)

page_path.write_text(page, encoding="utf-8")

test = test_path.read_text(encoding="utf-8")
old_test = '''test("botão de data abre o calendário nativo de forma explícita", () => {
  assert.match(page, /const dateInputRef = useRef<HTMLInputElement>\\(null\\)/);
  assert.match(page, /const openDatePicker = \\(\\) =>/);
  assert.match(page, /input\\.showPicker\\(\\)/);
  assert.match(page, /onClick=\\{openDatePicker\\}/);
  assert.match(page, /ref=\\{dateInputRef\\}/);
});
'''
new_test = '''test("botão de data usa calendário estilizado do sistema", () => {
  assert.match(page, /import \\{ OrdersDatePicker \\} from "\\.\\/OrdersDatePicker"/);
  assert.match(page, /<OrdersDatePicker/);
  assert.match(page, /value=\\{selectedDate\\}/);
  assert.match(page, /onChange=\\{setSelectedDate\\}/);
  assert.doesNotMatch(page, /showPicker/);
  assert.doesNotMatch(page, /type="date"/);
});
'''
if old_test not in test:
    raise SystemExit("Não encontrou teste do seletor nativo")
test = test.replace(old_test, new_test, 1)
test_path.write_text(test, encoding="utf-8")
