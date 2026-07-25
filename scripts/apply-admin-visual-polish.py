from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"Esperava 1 ocorrência em {path}, encontrei {count}: {old[:80]!r}")
    file_path.write_text(source.replace(old, new, 1), encoding="utf-8")


def replace_count(path: str, old: str, new: str, expected: int) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != expected:
        raise RuntimeError(f"Esperava {expected} ocorrência(s) em {path}, encontrei {count}: {old[:80]!r}")
    file_path.write_text(source.replace(old, new), encoding="utf-8")


DASHBOARD = "src/app/admin/(painel)/page.tsx"
ORDERS = "src/app/admin/(painel)/orders/page.tsx"
HISTORY = "src/app/admin/(painel)/history/page.tsx"
MENU = "src/app/admin/(painel)/menu/page.tsx"

replace_once(
    DASHBOARD,
    'className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"',
    'className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"',
)
replace_once(
    DASHBOARD,
    '<h3 className="text-xl font-black text-gray-950">Pulso da loja</h3>',
    '<h3 className="text-xl font-black text-gray-950">Status da loja</h3>',
)

replace_once(
    ORDERS,
    'import { OrderStatusBadge } from "@/components/ui/order-status-badge";\n',
    'import { OrderStatusBadge } from "@/components/ui/order-status-badge";\nimport { LiveStatusDot } from "@/components/ui/live-status-dot";\n',
)
replace_once(
    ORDERS,
    '<span className="h-2 w-2 rounded-full bg-emerald-500" />\n              Loja aberta',
    '<LiveStatusDot />\n              Loja aberta',
)
replace_once(
    ORDERS,
    '<span className="leading-tight">Método de<br />pagamento</span>',
    '<span className="whitespace-nowrap">Método de pagamento</span>',
)

replace_count(
    HISTORY,
    'grid-cols-[88px_1.1fr_1fr_0.9fr_0.9fr_140px_132px]',
    'grid-cols-[88px_1.1fr_1fr_minmax(118px,0.9fr)_0.9fr_140px_132px]',
    2,
)
replace_once(
    HISTORY,
    '<OrderStatusBadge status={order.status} />',
    '<OrderStatusBadge status={order.status} className="whitespace-nowrap" />',
)

replace_once(
    MENU,
    '<span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-gray-400" aria-hidden="true">',
    '<span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">',
)
replace_once(
    MENU,
    '''          <button
            onClick={handleOpenImportModal}
            className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-700"
          >''',
    '''          <button
            onClick={handleOpenImportModal}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-700"
          >''',
)
replace_once(
    MENU,
    '''          <button
            onClick={handleOpenCategoryModal}
            className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-700"
          >''',
    '''          <button
            onClick={handleOpenCategoryModal}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-700"
          >''',
)
replace_once(
    MENU,
    '''          <button
            onClick={handleOpenNewProduct}
            className="brand-gradient rounded-2xl px-5 py-3 text-sm font-bold text-white"
          >''',
    '''          <button
            onClick={handleOpenNewProduct}
            className="brand-gradient inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-bold text-white"
          >''',
)
replace_once(
    MENU,
    'className="mt-5 overflow-hidden rounded-[28px] border border-[var(--line)] bg-[#fffdfa] shadow-[0_16px_36px_rgba(17,16,15,0.08)]"',
    'className="mt-5 overflow-hidden rounded-[18px] border border-[var(--line)] bg-[#fffdfa] shadow-[0_16px_36px_rgba(17,16,15,0.08)]"',
)

Path("tests/admin-visual-polish.test.js").write_text(
    '''const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dashboard = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const orders = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");
const history = fs.readFileSync("src/app/admin/(painel)/history/page.tsx", "utf8");
const menu = fs.readFileSync("src/app/admin/(painel)/menu/page.tsx", "utf8");

test("dashboard alinha ação no topo e usa nome claro para o status da loja", () => {
  assert.match(dashboard, /lg:items-start lg:justify-between/);
  assert.match(dashboard, />Status da loja<\/h3>/);
  assert.doesNotMatch(dashboard, />Pulso da loja<\/h3>/);
});

test("pedidos mantém pagamento em uma linha e pulsa no badge de loja aberta", () => {
  assert.match(orders, /whitespace-nowrap">Método de pagamento<\/span>/);
  assert.match(orders, /<LiveStatusDot \/>\s+Loja aberta/);
});

test("histórico reserva espaço e mantém a bolinha nos status operacionais", () => {
  assert.equal((history.match(/minmax\(118px,0\.9fr\)/g) || []).length, 2);
  assert.match(history, /<OrderStatusBadge status=\{order\.status\} className="whitespace-nowrap" \/>/);
});

test("cardápios centraliza busca, compacta ações e reduz o raio da prévia interna", () => {
  assert.match(menu, /left-4 top-1\/2 -translate-y-1\/2 text-gray-400/);
  assert.equal((menu.match(/inline-flex h-10 items-center justify-center rounded-2xl/g) || []).length >= 3, true);
  assert.match(menu, /mt-5 overflow-hidden rounded-\[18px\]/);
});
''',
    encoding="utf-8",
)

# Remove os arquivos temporários para que apenas as mudanças reais permaneçam no branch.
Path("scripts/apply-admin-visual-polish.py").unlink()
Path(".github/workflows/apply-admin-visual-polish.yml").unlink()
