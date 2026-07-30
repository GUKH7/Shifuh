import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fullPath = (file) => path.join(root, file);
const read = (file) => fs.readFileSync(fullPath(file), "utf8");
const write = (file, content) => {
  fs.mkdirSync(path.dirname(fullPath(file)), { recursive: true });
  fs.writeFileSync(fullPath(file), content);
};
const remove = (file) => {
  if (fs.existsSync(fullPath(file))) fs.unlinkSync(fullPath(file));
};
const replaceOnce = (file, before, after) => {
  const source = read(file);
  if (!source.includes(before)) throw new Error(`Trecho não encontrado em ${file}: ${before.slice(0, 100)}`);
  write(file, source.replace(before, after));
};

const primitives = "src/components/ui/admin-primitives.tsx";
replaceOnce(
  primitives,
  'className={cx("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}',
  'className={cx("admin-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}',
);
replaceOnce(primitives, 'className="flex min-w-0 items-center gap-4"', 'className="admin-page-header-main flex min-w-0 items-center gap-4"');
replaceOnce(
  primitives,
  'className="brand-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm sm:h-14 sm:w-14"',
  'className="admin-page-header-icon brand-gradient flex h-12 w-12 shrink-0 items-center justify-center text-white shadow-sm sm:h-14 sm:w-14"',
);
replaceOnce(
  primitives,
  '{action ? <div className="w-full sm:w-auto sm:shrink-0">{action}</div> : null}',
  '{action ? <div className="admin-page-header-action w-full sm:w-auto sm:shrink-0">{action}</div> : null}',
);
replaceOnce(
  primitives,
  '"inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",',
  '"admin-button inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",',
);
replaceOnce(
  primitives,
  'return <div aria-hidden="true" className={cx("animate-pulse rounded-2xl bg-white", className)} />;',
  'return <div aria-hidden="true" className={cx("admin-skeleton animate-pulse bg-white", className)} />;',
);
replaceOnce(
  primitives,
  'aria-label={`Ordenar por ${label}${active && direction ? ` em ordem ${direction === "asc" ? "crescente" : "decrescente"}` : ""}`}',
  'aria-label={`Ordenar por ${label}${active && direction ? ` em ordem ${direction === "asc" ? "crescente" : "decrescente"}` : ""}`}\n      aria-pressed={active}',
);

const globals = "src/app/globals.css";
replaceOnce(
  globals,
  '  --brand-soft: #fff0e8;\n}',
  '  --brand-soft: #fff0e8;\n  --admin-control-height: 44px;\n  --admin-radius-control: 14px;\n  --admin-radius-card: 24px;\n  --admin-focus-ring: 0 0 0 3px rgba(255, 90, 31, 0.16);\n}',
);
replaceOnce(
  globals,
  '  .surface-card {\n    background: var(--surface);\n    border: 1px solid var(--line);\n    box-shadow: 0 1px 2px rgba(17, 16, 15, 0.04);\n  }',
  '  .surface-card {\n    background: var(--surface);\n    border: 1px solid var(--line);\n    border-radius: var(--admin-radius-card);\n    box-shadow: 0 1px 2px rgba(17, 16, 15, 0.04);\n  }',
);

write("src/app/admin/(painel)/admin-responsive.css", `.admin-panel-content {
  min-width: 0;
}

.admin-page-shell {
  width: 100%;
  max-width: 1460px;
  margin-inline: auto;
}

.admin-control {
  width: 100%;
  min-height: var(--admin-control-height);
  border: 1px solid var(--line);
  border-radius: var(--admin-radius-control);
  background-color: #fff;
  padding: 0.625rem 1rem;
  color: #374151;
  font-size: 0.875rem;
  font-weight: 600;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

.admin-select,
.admin-panel-content select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-position: right 1rem center;
  background-repeat: no-repeat;
  background-size: 1rem;
  padding-right: 2.75rem !important;
}

.admin-button {
  min-height: var(--admin-control-height);
  border-radius: var(--admin-radius-control);
}

.admin-icon-button {
  display: inline-flex;
  width: var(--admin-control-height);
  height: var(--admin-control-height);
  min-height: var(--admin-control-height);
  align-items: center;
  justify-content: center;
  border-radius: var(--admin-radius-control);
}

.admin-page-header-icon,
.admin-skeleton,
.admin-page-shell .surface-card {
  border-radius: var(--admin-radius-card);
}

.admin-page-shell :where(button, a[href], input, select, textarea, [role="button"]):focus-visible,
.admin-panel-header :where(button, a[href], input):focus-visible {
  border-color: var(--brand) !important;
  outline: none;
  box-shadow: var(--admin-focus-ring);
}

.admin-panel-content :where(input, select, textarea, button, a) {
  min-width: 0;
}

.admin-page-header-action > :where(button, a) {
  white-space: nowrap;
}

@media (max-width: 767px) {
  .admin-page-header {
    align-items: stretch;
  }

  .admin-page-header-main {
    align-items: flex-start;
  }

  .admin-page-header-action,
  .admin-page-header-action > :where(button, a, div) {
    width: 100%;
  }

  .admin-page-header-action :where(button, a) {
    justify-content: center;
  }

  .admin-page-shell {
    overflow-wrap: anywhere;
  }

  .admin-responsive-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
}

@media (max-width: 639px) {
  .admin-page-header-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
  }

  .admin-responsive-actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-date-picker-popover {
    position: fixed !important;
    inset: auto 1rem max(1rem, env(safe-area-inset-bottom)) 1rem !important;
    width: auto !important;
    max-width: none !important;
    margin: 0 !important;
  }
}
`);

const dashboard = "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx";
replaceOnce(dashboard, '<article className="surface-card rounded-[24px] p-5">', '<article className="dashboard-metric-card surface-card p-5">');
replaceOnce(dashboard, '<div className="flex items-start justify-between gap-4">\n        <div className="min-w-0">\n          <p className="text-sm font-semibold text-gray-500">{card.label}</p>', '<div className="dashboard-metric-card-header flex items-start justify-between gap-4">\n        <div className="min-w-0">\n          <p className="dashboard-metric-card-label text-sm font-semibold text-gray-500">{card.label}</p>');
replaceOnce(dashboard, '<div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${card.iconClass}`}>', '<div className={`dashboard-metric-card-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${card.iconClass}`}>');
replaceOnce(dashboard, '<div className={`flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 shadow-sm sm:w-auto ${storeTone.shell}`}>', '<div className={`dashboard-store-card flex w-full items-center gap-3 border px-4 py-3 shadow-sm sm:w-auto ${storeTone.shell}`}>');
replaceOnce(dashboard, '<div className="flex items-center gap-3">\n          <label htmlFor="dashboard-period"', '<div className="dashboard-period-control flex items-center gap-3">\n          <label htmlFor="dashboard-period"');
replaceOnce(dashboard, '<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">', '<section className="dashboard-metrics-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-5">');
replaceOnce(dashboard, '<section className="grid gap-4 xl:grid-cols-12">', '<section className="dashboard-analytics-grid grid gap-4 xl:grid-cols-12">');
replaceOnce(dashboard, '<article className="surface-card overflow-visible rounded-[24px] p-4 sm:p-5 xl:col-span-3">\n          <div className="flex items-start justify-between gap-3">', '<article className="dashboard-top-products-card surface-card overflow-visible p-4 sm:p-5 xl:col-span-3">\n          <div className="dashboard-card-header flex items-start justify-between gap-3">');
replaceOnce(dashboard, '<article className="surface-card rounded-[24px] p-4 sm:p-5 xl:col-span-4">', '<article className="dashboard-sources-card surface-card p-4 sm:p-5 xl:col-span-4">');
replaceOnce(dashboard, '<section className="grid gap-4 xl:grid-cols-12">', '<section className="dashboard-secondary-grid grid gap-4 xl:grid-cols-12">');
replaceOnce(
  dashboard,
  `            <Link
              href="/admin/settings"
              aria-label="Abrir configurações da loja"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-500 transition-colors hover:text-gray-950"
            >
              <MoreVertical size={17} />
            </Link>
`,
  "",
);

write("src/app/admin/(painel)/dashboard-period.module.css", `.page :global(.dashboard-metrics-grid .dashboard-metric-card-label) {
  white-space: nowrap;
}

.page :global(.dashboard-store-card),
.page :global(.dashboard-period-control) {
  border-radius: var(--admin-radius-card);
}

.page :global(.dashboard-period-control) {
  position: relative;
  width: min(100%, 19rem);
  min-width: 17.5rem;
  padding: 0.625rem 0.7rem 0.625rem 3rem;
  border: 1px solid rgba(225, 207, 192, 0.9);
  background: linear-gradient(135deg, rgba(255, 106, 0, 0.07), transparent 52%), rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 26px rgba(77, 48, 29, 0.06);
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.page :global(.dashboard-period-control)::before,
.page :global(.dashboard-period-control)::after {
  position: absolute;
  top: 50%;
  content: "";
  transform: translateY(-50%);
}

.page :global(.dashboard-period-control)::before {
  left: 0.75rem;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid rgba(255, 106, 0, 0.14);
  border-radius: 10px;
  background: rgba(255, 106, 0, 0.1);
}

.page :global(.dashboard-period-control)::after {
  left: 1.2rem;
  width: 0.85rem;
  height: 0.85rem;
  background: var(--brand);
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 2v4M16 2v4M3 10h18'/%3E%3Crect x='3' y='4' width='18' height='17' rx='2'/%3E%3C/svg%3E");
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}

.page :global(.dashboard-period-control:hover) {
  border-color: rgba(255, 106, 0, 0.32);
}

.page :global(.dashboard-period-control:focus-within) {
  z-index: 120;
  border-color: var(--brand);
  box-shadow: var(--admin-focus-ring), 0 14px 32px rgba(77, 48, 29, 0.09);
  transform: translateY(-1px);
}

.page :global(.dashboard-period-control label) {
  color: #9a6a48;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.075em;
  line-height: 1rem;
  text-transform: uppercase;
}

.page :global(.dashboard-period-control #dashboard-period) {
  width: 100% !important;
  min-height: 2.45rem !important;
  border-color: transparent !important;
  border-radius: 12px !important;
  background-color: rgba(255, 255, 255, 0.86) !important;
  box-shadow: inset 0 0 0 1px rgba(225, 207, 192, 0.72);
  color: #312a25;
  font-size: 0.875rem;
  font-weight: 800;
}

.page :global(.dashboard-analytics-grid) {
  overflow: visible;
}

.page :global(.dashboard-top-products-card),
.page :global(.dashboard-sources-card) {
  align-self: stretch;
}

.page :global(.dashboard-top-products-card) {
  position: relative;
  z-index: 3;
  background: radial-gradient(circle at 100% 0%, rgba(255, 106, 0, 0.1), transparent 38%), linear-gradient(180deg, #fffdfb 0%, #ffffff 58%, #fffaf6 100%);
}

.page :global(.dashboard-card-header) {
  padding-bottom: 0.875rem;
  border-bottom: 1px solid rgba(238, 227, 217, 0.8);
}

.page :global(.dashboard-top-products-card .recharts-wrapper),
.page :global(.dashboard-top-products-card .recharts-surface) {
  overflow: visible !important;
}

.page :global(.dashboard-top-products-card .recharts-yAxis .recharts-cartesian-axis-tick-value) {
  fill: #3f3833;
  font-size: 11px;
  font-weight: 700;
}

.page :global(.dashboard-top-products-card .recharts-bar-rectangle path) {
  filter: drop-shadow(0 5px 7px rgba(255, 106, 0, 0.18));
  transition: filter 160ms ease, opacity 160ms ease, transform 160ms ease;
  transform-box: fill-box;
  transform-origin: left center;
}

.page :global(.dashboard-top-products-card .recharts-bar-rectangle:hover path) {
  filter: drop-shadow(0 7px 10px rgba(255, 106, 0, 0.3));
  transform: scaleX(1.025);
}

.page :global(.dashboard-top-products-card .recharts-tooltip-wrapper) {
  z-index: 50 !important;
  overflow: visible !important;
  pointer-events: none;
}

.page :global(.dashboard-top-products-card .recharts-default-tooltip) {
  max-width: min(280px, calc(100vw - 2rem));
  border: 1px solid #f1ded0 !important;
  border-radius: var(--admin-radius-control) !important;
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow: 0 16px 34px rgba(63, 43, 29, 0.16) !important;
  white-space: normal !important;
}

@media (min-width: 1280px) {
  .page :global(.dashboard-top-products-card),
  .page :global(.dashboard-sources-card) {
    min-height: 380px;
  }

  .page :global(.dashboard-top-products-card) {
    display: flex;
    flex-direction: column;
  }
}

@media (min-width: 1280px) and (max-width: 1535px) {
  .page :global(.dashboard-metric-card) {
    padding: 1rem;
  }

  .page :global(.dashboard-metric-card-header) {
    gap: 0.5rem;
  }

  .page :global(.dashboard-metric-card-label) {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: -0.015em;
  }

  .page :global(.dashboard-metric-card-icon) {
    width: 2.5rem;
    height: 2.5rem;
  }
}

@media (max-width: 639px) {
  .page :global(.dashboard-period-control) {
    width: 100%;
    min-width: 0;
  }

  .page :global(.dashboard-top-products-card .recharts-yAxis .recharts-cartesian-axis-tick-value) {
    font-size: 10px;
  }
}
`);

replaceOnce(
  "src/app/admin/(painel)/page.tsx",
  'import "./dashboard-card-heights.module.css";\n',
  "",
);
remove("src/app/admin/(painel)/dashboard-card-heights.module.css");
remove("src/app/admin/(painel)/dashboard-header-layout.module.css");

const datePicker = "src/components/ui/admin-date-picker.tsx";
replaceOnce(datePicker, 'import { useEffect, useMemo, useRef, useState } from "react";', 'import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";');
replaceOnce(datePicker, '  const containerRef = useRef<HTMLDivElement>(null);', '  const containerRef = useRef<HTMLDivElement>(null);\n  const triggerRef = useRef<HTMLButtonElement>(null);\n  const calendarRef = useRef<HTMLDivElement>(null);');
replaceOnce(
  datePicker,
  '  const [visibleMonth, setVisibleMonth] = useState(\n    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12),\n  );',
  '  const [visibleMonth, setVisibleMonth] = useState(\n    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12),\n  );\n  const [activeDateValue, setActiveDateValue] = useState(value);',
);
replaceOnce(
  datePicker,
  '      if (event.key === "Escape") setIsOpen(false);',
  '      if (event.key === "Escape") {\n        event.preventDefault();\n        setIsOpen(false);\n        triggerRef.current?.focus();\n      }',
);
replaceOnce(
  datePicker,
  '  const selectDate = (date: Date) => {',
  `  const focusDateButton = (dateValue: string) => {
    window.requestAnimationFrame(() => {
      calendarRef.current
        ?.querySelector<HTMLButtonElement>('[data-date="' + dateValue + '"]')
        ?.focus();
    });
  };

  const handleDateKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectDate(date);
      return;
    }

    const nextDate = new Date(date);
    let handled = true;
    if (event.key === "ArrowLeft") nextDate.setDate(nextDate.getDate() - 1);
    else if (event.key === "ArrowRight") nextDate.setDate(nextDate.getDate() + 1);
    else if (event.key === "ArrowUp") nextDate.setDate(nextDate.getDate() - 7);
    else if (event.key === "ArrowDown") nextDate.setDate(nextDate.getDate() + 7);
    else if (event.key === "Home") nextDate.setDate(nextDate.getDate() - nextDate.getDay());
    else if (event.key === "End") nextDate.setDate(nextDate.getDate() + (6 - nextDate.getDay()));
    else if (event.key === "PageUp") nextDate.setMonth(nextDate.getMonth() - 1);
    else if (event.key === "PageDown") nextDate.setMonth(nextDate.getMonth() + 1);
    else handled = false;

    if (!handled) return;
    event.preventDefault();
    const nextValue = formatDateValue(nextDate);
    setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1, 12));
    setActiveDateValue(nextValue);
    focusDateButton(nextValue);
  };

  const selectDate = (date: Date) => {`,
);
replaceOnce(datePicker, '        type="button"\n        onClick={() => setIsOpen((current) => !current)}', '        ref={triggerRef}\n        type="button"\n        onClick={() => {\n          setActiveDateValue(value);\n          setIsOpen((current) => !current);\n        }}');
replaceOnce(datePicker, 'className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border', 'className="admin-button inline-flex min-h-11 cursor-pointer items-center gap-2.5 border');
replaceOnce(datePicker, '          role="dialog"\n          aria-label="Calendário"\n          className="absolute right-0 top-full', '          ref={calendarRef}\n          role="dialog"\n          aria-label="Calendário"\n          className="admin-date-picker-popover absolute right-0 top-full');
replaceOnce(datePicker, 'className="inline-flex h-9 w-9 items-center justify-center rounded-xl border', 'className="admin-icon-button inline-flex items-center justify-center border');
replaceOnce(datePicker, 'className="inline-flex h-9 w-9 items-center justify-center rounded-xl border', 'className="admin-icon-button inline-flex items-center justify-center border');
replaceOnce(
  datePicker,
  '                    type="button"\n                    onClick={() => selectDate(date)}',
  '                    type="button"\n                    data-date={dateValue}\n                    tabIndex={dateValue === activeDateValue ? 0 : -1}\n                    onFocus={() => setActiveDateValue(dateValue)}\n                    onKeyDown={(event) => handleDateKeyDown(event, date)}\n                    onClick={() => selectDate(date)}',
);
replaceOnce(datePicker, 'relative inline-flex h-9 w-9 items-center justify-center justify-self-center rounded-xl text-sm font-bold transition', 'relative inline-flex h-9 w-9 items-center justify-center justify-self-center rounded-xl text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300');
replaceOnce(datePicker, 'className="shrink-0 rounded-xl border border-orange-200', 'className="admin-button shrink-0 border border-orange-200');

const corrections = new Map([
  ["Ticket medio", "Ticket médio"],
  ["ticket medio", "ticket médio"],
  ["Ultima compra", "Última compra"],
  ["ultima compra", "última compra"],
  ["Configuracoes", "Configurações"],
  ["Historico", "Histórico"],
  ["Nao foi possível", "Não foi possível"],
  ["Nao foi possivel", "Não foi possível"],
  ["Nao ha", "Não há"],
  ["sem comentario", "sem comentário"],
  ["Nenhum comentario", "Nenhum comentário"],
  ["avaliacao encontrada", "avaliação encontrada"],
  ["avaliacoes encontradas", "avaliações encontradas"],
  [" visiveis", " visíveis"],
]);

const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (/\.(tsx|ts)$/.test(entry.name)) {
      let source = fs.readFileSync(target, "utf8");
      for (const [before, after] of corrections) source = source.split(before).join(after);
      fs.writeFileSync(target, source);
    }
  }
};
visit(fullPath("src"));

write("tests/dashboard-custom-period.test.cjs", `const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("dashboard oferece período personalizado com calendário compartilhado", () => {
  assert.match(dashboard, /type DashboardPeriod = [^;]*"custom"/);
  assert.match(dashboard, /Período personalizado/);
  assert.match(dashboard, /period === "custom"/);
  assert.match(dashboard, /<AdminDatePicker/);
  assert.match(dashboard, /Comparação automática com o período anterior de mesma duração/);
});

test("período personalizado recalcula comparação e série do gráfico", () => {
  assert.match(dashboard, /comparisonLabel: "vs\\. período anterior"/);
  assert.match(dashboard, /previousStart = startOfDay\\(addDays\\(normalizedStart, -days\\)\\)/);
  assert.match(dashboard, /buildRevenueSeries\\(validPeriodOrders, period, range\\)/);
  assert.match(dashboard, /\\[orders, period, customStart, customEnd\\]/);
});

test("dashboard usa classes semânticas em vez de seletores estruturais", () => {
  assert.match(dashboard, /dashboard-period-control/);
  assert.match(dashboard, /dashboard-metrics-grid/);
  assert.match(dashboard, /dashboard-analytics-grid/);
  assert.match(styles, /dashboard-top-products-card/);
  assert.doesNotMatch(styles, /:has|nth-child|first-child|\\[class\\*=/);
});
`);

write("tests/dashboard-header-layout.test.cjs", `const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("dashboard usa o shell e o cabeçalho compartilhados", () => {
  assert.match(page, /DashboardPeriodWorkspace/);
  assert.match(dashboard, /<AdminPageShell/);
  assert.match(dashboard, /<AdminPageHeader/);
  assert.match(dashboard, /dashboard-store-card/);
});

test("cards do cabeçalho e período usam classes semânticas", () => {
  assert.match(styles, /dashboard-store-card/);
  assert.match(styles, /dashboard-period-control/);
  assert.doesNotMatch(styles, /:has|first-child|last-child|nth-child/);
});
`);

write("tests/admin-visual-polish.test.js", `const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const dashboardStyles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");
const orders = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");
const history = fs.readFileSync("src/app/admin/(painel)/history/page.tsx", "utf8");
const menu = fs.readFileSync("src/app/admin/(painel)/menu/page.tsx", "utf8");

test("dashboard mantém cinco indicadores e cards analíticos sem seletores frágeis", () => {
  assert.match(dashboard, /dashboard-metrics-grid/);
  assert.match(dashboard, /dashboard-top-products-card/);
  assert.match(dashboard, /Produtos mais pedidos/);
  assert.doesNotMatch(dashboardStyles, /:has|nth-child|first-child|\\[class\\*=/);
});

test("pedidos mantém pagamento em uma linha e status real da loja", () => {
  assert.match(orders, /whitespace-nowrap">Método de pagamento<\\/span>/);
  assert.match(orders, /getStoreStatus\\(restaurantConfig\\?\\.work_hours, storeClock\\)/);
});

test("histórico mantém linhas expansíveis e status operacionais", () => {
  assert.match(history, /<details key=\\{order\\.id\\}/);
  assert.match(history, /<OrderStatusBadge/);
});

test("cardápios mantém busca e ações responsivas", () => {
  assert.match(menu, /Buscar item ou categoria/);
  assert.match(menu, /Importar do iFood/);
  assert.match(menu, /Categoria/);
  assert.match(menu, /Produto/);
});
`);

write("tests/priority-3-visual-polish.test.js", `const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");
const primitives = read("src/components/ui/admin-primitives.tsx");
const responsive = read("src/app/admin/(painel)/admin-responsive.css");
const globals = read("src/app/globals.css");
const dashboard = read("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx");
const dashboardStyles = read("src/app/admin/(painel)/dashboard-period.module.css");
const datePicker = read("src/components/ui/admin-date-picker.tsx");

test("controles e cards usam tokens visuais compartilhados", () => {
  assert.match(globals, /--admin-control-height: 44px/);
  assert.match(globals, /--admin-radius-control: 14px/);
  assert.match(globals, /--admin-radius-card: 24px/);
  assert.match(primitives, /admin-button/);
  assert.match(primitives, /admin-page-header/);
  assert.match(responsive, /var\\(--admin-control-height\\)/);
  assert.match(responsive, /var\\(--admin-radius-card\\)/);
});

test("CSS administrativo não depende de strings Tailwind ou posição dos elementos", () => {
  for (const source of [responsive, dashboardStyles]) {
    assert.doesNotMatch(source, /:has|nth-child|first-child|last-child|\\[class\\*=/);
  }
  assert.match(dashboard, /dashboard-metric-card/);
  assert.match(dashboard, /dashboard-period-control/);
  assert.match(dashboard, /dashboard-top-products-card/);
});

test("navegação por teclado cobre ordenação calendário e foco visível", () => {
  assert.match(primitives, /aria-pressed=\\{active\\}/);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]) {
    assert.match(datePicker, new RegExp(key));
  }
  assert.match(datePicker, /triggerRef\\.current\\?\\.focus/);
  assert.match(datePicker, /data-date=\\{dateValue\\}/);
  assert.match(responsive, /:focus-visible/);
});

test("textos administrativos não contêm erros recorrentes de acentuação", () => {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (/\\.(tsx|ts)$/.test(entry.name)) files.push(target);
    }
  };
  walk("src");
  const source = files.map(read).join("\\n");
  assert.doesNotMatch(source, /Ticket medio|Ultima compra|Configuracoes|Historico|sem comentario|\\bvisiveis\\b/);
});
`);

console.log("Prioridade 3 aplicada com sucesso.");
