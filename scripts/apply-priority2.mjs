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
const replaceOnce = (file, search, replacement, label = String(search)) => {
  const content = read(file);
  if (!content.includes(search)) throw new Error(`Trecho não encontrado em ${file}: ${label}`);
  write(file, content.replace(search, replacement));
};
const replaceRegex = (file, pattern, replacement, label = String(pattern)) => {
  const content = read(file);
  pattern.lastIndex = 0;
  if (!pattern.test(content)) throw new Error(`Padrão não encontrado em ${file}: ${label}`);
  pattern.lastIndex = 0;
  write(file, content.replace(pattern, replacement));
};
const addImportAfter = (file, anchor, importLine) => {
  const content = read(file);
  if (content.includes(importLine)) return;
  if (!content.includes(anchor)) throw new Error(`Âncora de import não encontrada em ${file}: ${anchor}`);
  write(file, content.replace(anchor, `${anchor}\n${importLine}`));
};

// Componentes compartilhados para carregamento, erro e vazio.
write(
  "src/components/ui/admin-page-states.tsx",
  String.raw`import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { AdminButton, AdminPageShell, AdminSkeleton } from "@/components/ui/admin-primitives";

export function AdminPageSkeleton({
  ariaLabel,
  metrics = 4,
  children,
}: {
  ariaLabel: string;
  metrics?: number;
  children?: ReactNode;
}) {
  return (
    <AdminPageShell className="space-y-6 pb-12" role="status" aria-label={ariaLabel}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <AdminSkeleton className="h-12 w-12 sm:h-14 sm:w-14" />
          <div className="space-y-2">
            <AdminSkeleton className="h-7 w-40" />
            <AdminSkeleton className="h-4 w-72 max-w-[68vw]" />
          </div>
        </div>
        <AdminSkeleton className="h-11 w-full sm:w-44" />
      </div>
      {metrics > 0 ? (
        <div className={metrics === 5 ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-5" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"}>
          {Array.from({ length: metrics }).map((_, index) => (
            <AdminSkeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : null}
      {children ?? <AdminSkeleton className="h-[460px] w-full" />}
    </AdminPageShell>
  );
}

export function AdminErrorState({
  title = "Não foi possível carregar esta página",
  description,
  onRetry,
  retryLabel = "Tentar novamente",
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <AdminPageShell>
      <div className="surface-card flex min-h-56 flex-col items-center justify-center rounded-[28px] border-red-200 bg-red-50/70 px-6 py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <AlertTriangle size={22} />
        </span>
        <h2 className="mt-4 text-lg font-black text-gray-950">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-red-700">{description}</p>
        {onRetry ? (
          <AdminButton variant="secondary" className="mt-5" onClick={onRetry}>
            <RefreshCw size={16} />
            {retryLabel}
          </AdminButton>
        ) : null}
      </div>
    </AdminPageShell>
  );
}

export function AdminEmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-8 text-center"
          : "flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center"
      }
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[var(--brand)]">
        {icon ?? <Inbox size={21} />}
      </span>
      <h3 className="mt-4 font-black text-gray-950">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
`,
);

// Reaproveita o calendário de Pedidos como componente administrativo global.
let sharedCalendar = read("src/app/admin/(painel)/orders/OrdersDatePicker.tsx");
sharedCalendar = sharedCalendar
  .replace(/type OrdersDatePickerProps/g, "export type AdminDatePickerProps")
  .replace(/OrdersDatePickerProps/g, "AdminDatePickerProps")
  .replace(/export function OrdersDatePicker/g, "export function AdminDatePicker")
  .replace("  label: string;", "  label?: string;")
  .replace(
    "  const monthLabel = capitalize(",
    "  const displayLabel = label || selectedDate.toLocaleDateString(\"pt-BR\", { day: \"2-digit\", month: \"2-digit\", year: \"numeric\" });\n  const monthLabel = capitalize(",
  )
  .replace(/\{label\}/g, "{displayLabel}")
  .replace("Escolher data dos pedidos. Data selecionada:", "Escolher data. Data selecionada:")
  .replace('aria-label="Calendário de pedidos"', 'aria-label="Calendário"');
write("src/components/ui/admin-date-picker.tsx", sharedCalendar);
write(
  "src/app/admin/(painel)/orders/OrdersDatePicker.tsx",
  'export { AdminDatePicker as OrdersDatePicker } from "@/components/ui/admin-date-picker";\n',
);

// Cabeçalho compartilhado aceita ações em largura total no mobile.
replaceOnce(
  "src/components/ui/admin-primitives.tsx",
  '{action ? <div className="shrink-0">{action}</div> : null}',
  '{action ? <div className="w-full sm:w-auto sm:shrink-0">{action}</div> : null}',
  "container da ação do cabeçalho",
);

// Pedidos: shell/cabeçalho compartilhados, erro/vazio padrão e resumo sticky.
addImportAfter(
  "src/app/admin/(painel)/orders/page.tsx",
  'import { LiveStatusDot } from "@/components/ui/live-status-dot";',
  'import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";\nimport { AdminEmptyState, AdminErrorState } from "@/components/ui/admin-page-states";',
);
replaceOnce(
  "src/app/admin/(painel)/orders/page.tsx",
  '  if (errorMsg) return <div className="p-8 text-center text-red-600">{errorMsg}</div>;',
  '  if (errorMsg) return <AdminErrorState description={errorMsg} />;',
  "erro de pedidos",
);
replaceRegex(
  "src/app/admin/(painel)/orders/page.tsx",
  /      <div className=\{`mx-auto max-w-\[1460px\] space-y-4 \$\{isSummaryOpen \? "pb-\[26rem\]" : "pb-20"\}`\}>[\s\S]*?        <section className="grid gap-3 lg:grid-cols-\[1fr_auto\]">/,
  String.raw`      <AdminPageShell className="space-y-4 pb-6">
        <AdminPageHeader
          title="Pedidos"
          description={
            isCurrentDate
              ? "Acompanhe e atualize os pedidos em tempo real."
              : "Consulte os pedidos e resultados da data selecionada."
          }
          icon={<ShoppingBag size={22} />}
          action={
            <div className="flex flex-wrap gap-3">
              <OrdersDatePicker value={selectedDate} label={selectedDateLabel} onChange={setSelectedDate} />
              <div
                className={[
                  "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black",
                  isCurrentDate ? storeStatusClasses : "border-gray-200 bg-gray-50 text-gray-600",
                ].join(" ")}
              >
                {isCurrentDate ? <LiveStatusDot className={storeStatusDotClass} /> : <CalendarDays size={16} />}
                {isCurrentDate ? "Loja " + storeStatus.label.toLowerCase() : "Consulta histórica"}
              </div>
            </div>
          }
        />

        <section className="grid gap-3 lg:grid-cols-[1fr_auto]">`,
  "cabeçalho de pedidos",
);
replaceRegex(
  "src/app/admin/(painel)/orders/page.tsx",
  /\{filteredOrders\.length === 0 \? \(\s*<div className="px-6 py-16 text-center">[\s\S]*?<\/div>\s*\) : \(/,
  String.raw`{filteredOrders.length === 0 ? (
              <AdminEmptyState
                icon={<Package size={22} />}
                title="Não encontrou o pedido que procura?"
                description="Tente ajustar os filtros ou buscar por outro termo."
                action={
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700"
                  >
                    <RefreshCw size={16} />
                    Limpar filtros
                  </button>
                }
              />
            ) : (`,
  "estado vazio de pedidos",
);
replaceOnce(
  "src/app/admin/(painel)/orders/page.tsx",
  `        </section>\n\n      </div>\n\n      <section className="fixed bottom-3 left-3 right-3 z-40 overflow-hidden rounded-[18px] border border-[var(--line)] bg-white/95 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur md:bottom-3 md:left-[calc(var(--admin-sidebar-width)+1.5rem)] md:right-6">`,
  `        </section>\n\n        <section className="sticky bottom-3 z-20 overflow-hidden rounded-[18px] border border-[var(--line)] bg-white/95 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur">`,
  "resumo fixed de pedidos",
);
replaceRegex(
  "src/app/admin/(painel)/orders/page.tsx",
  /\n      <\/section>\n    <\/>\n  \);\n}\s*$/,
  `\n        </section>\n      </AdminPageShell>\n    </>\n  );\n}\n`,
  "fechamento do shell de pedidos",
);
replaceOnce("src/app/admin/(painel)/orders/page.tsx", "Ticket medio", "Ticket médio");
replaceOnce("src/app/admin/(painel)/orders/page.tsx", " visiveis", " visíveis");
write(
  "src/app/admin/(painel)/orders/OrdersSkeleton.tsx",
  String.raw`import { AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { AdminSkeleton } from "@/components/ui/admin-primitives";

export function OrdersSkeleton() {
  return (
    <AdminPageSkeleton ariaLabel="Carregando pedidos" metrics={0}>
      <section className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <AdminSkeleton className="h-[70px] w-full" />
        <AdminSkeleton className="h-[70px] w-full lg:w-44" />
      </section>
      <section className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <AdminSkeleton className="h-11 flex-1" />
          <AdminSkeleton className="h-11 xl:w-32" />
        </div>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <AdminSkeleton key={index} className="h-11 w-28" />
          ))}
        </div>
        <AdminSkeleton className="h-[310px] w-full" />
      </section>
      <section className="sticky bottom-3 z-20 rounded-[18px] border border-[var(--line)] bg-white/95 p-4 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <AdminSkeleton className="h-5 w-32" />
            <AdminSkeleton className="h-3 w-40" />
          </div>
          <div className="flex gap-2">
            <AdminSkeleton className="h-9 w-20" />
            <AdminSkeleton className="h-9 w-24" />
            <AdminSkeleton className="h-9 w-28" />
          </div>
        </div>
      </section>
    </AdminPageSkeleton>
  );
}
`,
);
replaceRegex(
  "src/app/globals.css",
  /\n@media \(min-width: 768px\) \{\n  \.admin-panel-content > section\.fixed:has\(> button\[aria-expanded\]\) \{[\s\S]*?\n  \}\n\}\n/,
  "\n",
  "compensação global do resumo fixed",
);

// Dashboard: skeleton, erro, vazios e calendário compartilhados.
replaceOnce("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "  AdminInput,\n", "");
replaceOnce("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "  AdminSkeleton,\n", "");
addImportAfter(
  "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx",
  'import { LiveStatusDot } from "@/components/ui/live-status-dot";',
  'import { AdminDatePicker } from "@/components/ui/admin-date-picker";\nimport { AdminEmptyState, AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";',
);
replaceRegex(
  "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx",
  /function DashboardSkeleton\(\) \{[\s\S]*?\n}\n\nfunction MetricCardView/,
  `function DashboardSkeleton() {\n  return <AdminPageSkeleton ariaLabel="Carregando dashboard" metrics={5} />;\n}\n\nfunction MetricCardView`,
  "skeleton do dashboard",
);
replaceRegex(
  "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx",
  /  if \(errorMsg\) \{\s*return \(\s*<AdminPageShell>[\s\S]*?<\/AdminPageShell>\s*\);\s*}/,
  '  if (errorMsg) return <AdminErrorState description={errorMsg} />;',
  "erro do dashboard",
);
replaceRegex(
  "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx",
  /<AdminInput\s+id="dashboard-custom-start"[\s\S]*?\/>/,
  String.raw`<AdminDatePicker
              value={customStart}
              label={formatRangeDate(parseInputDate(customStart) || new Date())}
              onChange={(value) => {
                setCustomStart(value);
                if (customEnd && value > customEnd) setCustomEnd(value);
              }}
            />`,
  "data inicial do dashboard",
);
replaceRegex(
  "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx",
  /<AdminInput\s+id="dashboard-custom-end"[\s\S]*?\/>/,
  String.raw`<AdminDatePicker
              value={customEnd}
              label={formatRangeDate(parseInputDate(customEnd) || new Date())}
              onChange={(value) => {
                setCustomEnd(value);
                if (customStart && value < customStart) setCustomStart(value);
              }}
            />`,
  "data final do dashboard",
);
replaceRegex(
  "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx",
  /<div className="mt-5 flex h-\[250px\] items-center justify-center rounded-2xl border border-dashed border-\[var\(--line\)\] bg-white px-5 text-center text-sm text-gray-500">\s*Nenhum produto vendido no período\.\s*<\/div>/,
  '<AdminEmptyState compact title="Nenhum produto vendido" description="Os produtos aparecerão aqui quando houver vendas no período." />',
  "vazio de produtos do dashboard",
);
replaceRegex(
  "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx",
  /<div className="mt-5 flex h-\[250px\] items-center justify-center rounded-2xl border border-dashed border-\[var\(--line\)\] bg-white px-5 text-center text-sm text-gray-500">\s*Nenhum pedido registrado no período\.\s*<\/div>/,
  '<AdminEmptyState compact title="Nenhum pedido registrado" description="Altere o período ou aguarde novos pedidos." />',
  "vazio de fontes do dashboard",
);
replaceRegex(
  "src/app/admin/(painel)/DashboardPeriodWorkspace.tsx",
  /<div className="flex min-h-\[270px\] items-center justify-center px-6 text-center text-sm text-gray-500">Nenhum pedido registrado no período\.<\/div>/,
  '<AdminEmptyState compact title="Nenhum pedido recente" description="Os pedidos do período aparecerão aqui." />',
  "vazio de pedidos recentes do dashboard",
);

// Histórico: shell, cabeçalho, calendário e estados compartilhados.
addImportAfter(
  "src/app/admin/(painel)/history/page.tsx",
  'import { getOrderStatusLabel } from "@/lib/order-status";',
  'import { AdminButton, AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";\nimport { AdminDatePicker } from "@/components/ui/admin-date-picker";\nimport { AdminEmptyState, AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";',
);
replaceRegex(
  "src/app/admin/(painel)/history/page.tsx",
  /function HistorySkeleton\(\) \{[\s\S]*?\n}\n\nexport default function HistoryPage/,
  `function HistorySkeleton() {\n  return <AdminPageSkeleton ariaLabel="Carregando histórico" metrics={4} />;\n}\n\nexport default function HistoryPage`,
  "skeleton do histórico",
);
replaceRegex(
  "src/app/admin/(painel)/history/page.tsx",
  /  if \(errorMsg\) \{[\s\S]*?\n  }\n\n  return \(/,
  '  if (errorMsg) return <AdminErrorState description={errorMsg} />;\n\n  return (',
  "erro do histórico",
);
replaceRegex(
  "src/app/admin/(painel)/history/page.tsx",
  /    <div className="admin-page-shell">[\s\S]*?      <section className="surface-card rounded-\[24px\] p-3 sm:rounded-\[28px\] sm:p-5 md:p-6">/,
  String.raw`    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Histórico"
        description="Consulte pedidos, produtos vendidos e valores em um só lugar."
        icon={<History size={22} />}
        action={
          <AdminButton variant="secondary" onClick={() => exportExcel(visibleOrders)} aria-label="Exportar histórico">
            <Download size={17} />
            Exportar
          </AdminButton>
        }
      />

      <section className="surface-card rounded-[24px] p-3 sm:rounded-[28px] sm:p-5 md:p-6">`,
  "cabeçalho do histórico",
);
replaceRegex(
  "src/app/admin/(painel)/history/page.tsx",
  /<input\s+type="date"\s+value=\{customStartDate\}[\s\S]*?\/>/,
  '<AdminDatePicker value={customStartDate} onChange={setCustomStartDate} />',
  "data inicial do histórico",
);
replaceRegex(
  "src/app/admin/(painel)/history/page.tsx",
  /<input\s+type="date"\s+value=\{customEndDate\}[\s\S]*?\/>/,
  '<AdminDatePicker value={customEndDate} onChange={setCustomEndDate} />',
  "data final do histórico",
);
replaceRegex(
  "src/app/admin/(painel)/history/page.tsx",
  /<div className="px-5 py-16 text-center text-sm text-gray-500">\s*Nenhum pedido encontrado para este filtro\.\s*<\/div>/,
  '<AdminEmptyState title="Nenhum pedido encontrado" description="Ajuste a busca, o período ou a situação selecionada." />',
  "vazio do histórico",
);
replaceRegex(
  "src/app/admin/(painel)/history/page.tsx",
  /\n    <\/div>\n  \);\n}\s*$/,
  '\n    </AdminPageShell>\n  );\n}\n',
  "fechamento do histórico",
);

// Clientes, Cupons e Avaliações: estados compartilhados.
const workspaces = [
  {
    file: "src/app/admin/(painel)/clients/ClientsWorkspace.tsx",
    skeleton: "ClientsWorkspaceSkeleton",
    label: "Carregando clientes",
    metrics: 3,
    emptyPattern: /<div className="px-6 py-16 text-center text-sm text-gray-500">Nenhum cliente encontrado\.<\/div>/,
    emptyReplacement: '<AdminEmptyState title="Nenhum cliente encontrado" description="Revise a busca e os filtros selecionados." />',
  },
  {
    file: "src/app/admin/(painel)/coupons/CouponsWorkspace.tsx",
    skeleton: "CouponsWorkspaceSkeleton",
    label: "Carregando cupons",
    metrics: 4,
    emptyPattern: /<div className="px-6 py-16 text-center text-sm text-gray-500">Nenhum cupom encontrado\.<\/div>/,
    emptyReplacement: '<AdminEmptyState title="Nenhum cupom encontrado" description="Revise a busca e os filtros selecionados." />',
  },
  {
    file: "src/app/admin/(painel)/reviews/ReviewsWorkspace.tsx",
    skeleton: "ReviewsWorkspaceSkeleton",
    label: "Carregando avaliações",
    metrics: 2,
    emptyPattern: /<div className="px-6 py-16 text-center text-sm text-gray-500">Nenhuma avaliação encontrada para este filtro\.<\/div>/,
    emptyReplacement: '<AdminEmptyState title="Nenhuma avaliação encontrada" description="Revise a busca e os filtros selecionados." />',
  },
];
for (const workspace of workspaces) {
  replaceOnce(workspace.file, "  AdminSkeleton,\n", "");
  addImportAfter(
    workspace.file,
    '} from "@/components/ui/admin-primitives";',
    'import { AdminEmptyState, AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";',
  );
  replaceRegex(
    workspace.file,
    new RegExp(`function ${workspace.skeleton}\\(\\) \\{[\\s\\S]*?\\n\\}\\n\\nexport default function`),
    `function ${workspace.skeleton}() {\n  return <AdminPageSkeleton ariaLabel="${workspace.label}" metrics={${workspace.metrics}} />;\n}\n\nexport default function`,
    `skeleton em ${workspace.file}`,
  );
  replaceRegex(
    workspace.file,
    /  if \(errorMsg\) \{[\s\S]*?\n  }\n\n  return \(/,
    '  if (errorMsg) return <AdminErrorState description={errorMsg} />;\n\n  return (',
    `erro em ${workspace.file}`,
  );
  replaceRegex(workspace.file, workspace.emptyPattern, workspace.emptyReplacement, `vazio em ${workspace.file}`);
}

// Cardápio: 1460px, cabeçalho, skeleton, erro e vazio compartilhados.
replaceOnce("src/app/admin/(painel)/menu/page.tsx", "  Search,\n", "  Search,\n  ShoppingBag,\n");
addImportAfter(
  "src/app/admin/(painel)/menu/page.tsx",
  'import { useToast } from "@/components/ui/toast-provider";',
  'import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";\nimport { AdminEmptyState, AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";',
);
replaceOnce(
  "src/app/admin/(painel)/menu/page.tsx",
  '  const [loading, setLoading] = useState(true);',
  '  const [loading, setLoading] = useState(true);\n  const [errorMsg, setErrorMsg] = useState("");',
);
replaceOnce(
  "src/app/admin/(painel)/menu/page.tsx",
  "  const fetchData = async () => {\n    try {",
  '  const fetchData = async () => {\n    setErrorMsg("");\n    try {',
);
replaceOnce(
  "src/app/admin/(painel)/menu/page.tsx",
  "      if (error || !resto) return;",
  '      if (error || !resto) {\n        setErrorMsg("Não foi possível localizar a loja.");\n        return;\n      }',
);
replaceOnce(
  "src/app/admin/(painel)/menu/page.tsx",
  '    } catch (error) {\n      console.error("Erro ao buscar cardápio:", error);',
  '    } catch (error) {\n      console.error("Erro ao buscar cardápio:", error);\n      setErrorMsg("Não foi possível carregar o cardápio.");',
);
replaceRegex(
  "src/app/admin/(painel)/menu/page.tsx",
  /  if \(loading\) \{[\s\S]*?\n  }\n\n  return \(/,
  '  if (loading) return <AdminPageSkeleton ariaLabel="Carregando cardápio" metrics={3} />;\n  if (errorMsg) return <AdminErrorState description={errorMsg} onRetry={() => void fetchData()} />;\n\n  return (',
  "loading/erro do cardápio",
);
replaceRegex(
  "src/app/admin/(painel)/menu/page.tsx",
  /    <div className="mx-auto w-full min-w-0 max-w-6xl pb-20">[\s\S]*?      <div className="grid min-w-0 gap-6 2xl:grid-cols-\[minmax\(0,1fr\)_minmax\(280px,360px\)\]">/,
  String.raw`    <AdminPageShell className="space-y-6 pb-20">
      <AdminPageHeader
        title="Cardápios"
        description="Organize categorias, destaque itens e ligue ou desligue produtos em segundos."
        icon={<ShoppingBag size={22} />}
        action={
          <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row lg:w-auto">
            <div className="relative w-full min-w-0 sm:min-w-[240px] lg:w-[280px]">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Buscar item ou categoria"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-11 w-full rounded-2xl border border-[var(--line)] bg-white pl-11 pr-4 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
            <button onClick={handleOpenImportModal} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-700">
              <Import size={16} /> Importar do iFood
            </button>
            <button onClick={handleOpenCategoryModal} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-700">
              <Plus size={16} /> Categoria
            </button>
            <button onClick={handleOpenNewProduct} className="brand-gradient inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold text-white">
              <Plus size={16} /> Produto
            </button>
          </div>
        }
      />
      <p className="text-sm font-medium text-gray-500">
        {isSavingCategory ? "Salvando ordem das categorias..." : <>{categories.length} categorias e {products.length} produtos na loja</>}
      </p>

      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">`,
  "cabeçalho do cardápio",
);
replaceRegex(
  "src/app/admin/(painel)/menu/page.tsx",
  /<div className="rounded-2xl border border-dashed border-\[var\(--line\)\] px-4 py-10 text-center text-sm text-gray-500">\s*Nenhum item visível para pré-visualizar\.\s*<\/div>/,
  '<AdminEmptyState compact title="Nenhum item visível" description="Ative produtos ou ajuste a busca para preencher a pré-visualização." />',
  "vazio do cardápio",
);
replaceRegex(
  "src/app/admin/(painel)/menu/page.tsx",
  /\n    <\/div>\n  \);\n}\s*$/,
  '\n    </AdminPageShell>\n  );\n}\n',
  "fechamento do cardápio",
);

// Configurações: 1460px, cabeçalho, skeleton e erro compartilhados.
addImportAfter(
  "src/app/admin/(painel)/settings/page.tsx",
  'import { useToast } from "@/components/ui/toast-provider";',
  'import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";\nimport { AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";',
);
replaceOnce(
  "src/app/admin/(painel)/settings/page.tsx",
  '  const [loading, setLoading] = useState(true);',
  '  const [loading, setLoading] = useState(true);\n  const [errorMsg, setErrorMsg] = useState("");',
);
replaceOnce(
  "src/app/admin/(painel)/settings/page.tsx",
  "  const fetchSettings = async () => {\n    try {",
  '  const fetchSettings = async () => {\n    setErrorMsg("");\n    try {',
);
replaceOnce(
  "src/app/admin/(painel)/settings/page.tsx",
  "    } catch (error) {\n      console.error(error);\n    } finally {",
  '    } catch (error) {\n      console.error(error);\n      setErrorMsg("Não foi possível carregar as configurações da loja.");\n    } finally {',
);
replaceRegex(
  "src/app/admin/(painel)/settings/page.tsx",
  /  if \(loading\) \{[\s\S]*?\n  }\n\n  return \(/,
  '  if (loading) return <AdminPageSkeleton ariaLabel="Carregando configurações" metrics={3} />;\n  if (errorMsg) return <AdminErrorState description={errorMsg} onRetry={() => void fetchSettings()} />;\n\n  return (',
  "loading/erro das configurações",
);
replaceRegex(
  "src/app/admin/(painel)/settings/page.tsx",
  /    <div className="mx-auto max-w-6xl pb-20">[\s\S]*?      <div className="flex flex-col gap-5">/,
  String.raw`    <AdminPageShell className="space-y-6 pb-20">
      <AdminPageHeader
        title="Configurações"
        description="Atualize dados da loja, identidade visual e regras de entrega."
        icon={<Store size={22} />}
        action={
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="brand-gradient inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar alterações
          </button>
        }
      />

      <div className="flex flex-col gap-5">`,
  "cabeçalho de configurações",
);
replaceRegex(
  "src/app/admin/(painel)/settings/page.tsx",
  /\n    <\/div>\n  \);\n}\s*$/,
  '\n    </AdminPageShell>\n  );\n}\n',
  "fechamento de configurações",
);

// Remove wrapper duplicado do dashboard, preservando o módulo visual analítico.
write(
  "src/app/admin/(painel)/page.tsx",
  String.raw`import DashboardPeriodWorkspace from "./DashboardPeriodWorkspace";
import styles from "./dashboard-period.module.css";
import "./dashboard-card-heights.module.css";

export default function AdminHomePage() {
  return (
    <div className={styles.page}>
      <DashboardPeriodWorkspace />
    </div>
  );
}
`,
);

// Atualiza testes existentes.
replaceOnce(
  "tests/orders-date-filters.test.js",
  `const calendar = fs.readFileSync(\n  "src/app/admin/(painel)/orders/OrdersDatePicker.tsx",\n  "utf8",\n);`,
  `const calendarAdapter = fs.readFileSync(\n  "src/app/admin/(painel)/orders/OrdersDatePicker.tsx",\n  "utf8",\n);\nconst calendar = fs.readFileSync("src/components/ui/admin-date-picker.tsx", "utf8");`,
  "leitura do calendário no teste",
);
replaceOnce(
  "tests/orders-date-filters.test.js",
  "  assert.match(calendar, /Calendário de pedidos/);",
  '  assert.match(calendarAdapter, /AdminDatePicker as OrdersDatePicker/);\n  assert.match(calendar, /aria-label="Calendário"/);',
);
replaceRegex(
  "tests/orders-summary-width.test.js",
  /test\("resumo de pedidos usa as mesmas bordas dos containers principais", \(\) => \{[\s\S]*?\n\}\);/,
  String.raw`test("resumo de pedidos usa o mesmo shell e não depende da janela", () => {
  const page = fs.readFileSync(path.join(root, "src/app/admin/(painel)/orders/page.tsx"), "utf8");
  assert.match(page, /<AdminPageShell className="space-y-4 pb-6">/);
  assert.match(page, /section className="sticky bottom-3/);
  assert.doesNotMatch(page, /section className="fixed bottom-3/);
  assert.doesNotMatch(globals, /section\.fixed:has/);
});`,
  "teste do resumo sticky",
);
replaceRegex(
  "tests/orders-summary-width.test.js",
  /test\("skeleton de pedidos representa a estrutura atual e o resumo fixo", \(\) => \{[\s\S]*?\n\}\);/,
  String.raw`test("skeleton de pedidos usa o padrão compartilhado e resumo sticky", () => {
  assert.match(skeleton, /AdminPageSkeleton/);
  assert.match(skeleton, /section className="sticky bottom-3/);
  assert.doesNotMatch(skeleton, /section className="fixed bottom-3/);
});`,
  "teste do skeleton sticky",
);

write(
  "tests/priority-2-visual-structure.test.js",
  String.raw`const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");
const responsive = read("src/app/admin/(painel)/admin-responsive.css");
const states = read("src/components/ui/admin-page-states.tsx");
const datePicker = read("src/components/ui/admin-date-picker.tsx");
const pages = {
  dashboard: read("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx"),
  orders: read("src/app/admin/(painel)/orders/page.tsx"),
  history: read("src/app/admin/(painel)/history/page.tsx"),
  menu: read("src/app/admin/(painel)/menu/page.tsx"),
  clients: read("src/app/admin/(painel)/clients/ClientsWorkspace.tsx"),
  coupons: read("src/app/admin/(painel)/coupons/CouponsWorkspace.tsx"),
  reviews: read("src/app/admin/(painel)/reviews/ReviewsWorkspace.tsx"),
  settings: read("src/app/admin/(painel)/settings/page.tsx"),
};

test("todas as páginas principais usam shell de 1460px e cabeçalho compartilhado", () => {
  assert.match(responsive, /\.admin-page-shell[\s\S]*max-width:\s*1460px/);
  for (const [name, page] of Object.entries(pages)) {
    assert.match(page, /AdminPageShell/, name + " sem AdminPageShell");
    assert.match(page, /AdminPageHeader/, name + " sem AdminPageHeader");
    assert.doesNotMatch(page, /max-w-6xl/, name + " ainda limitado a 6xl");
  }
});

test("skeleton erro e vazio possuem componentes compartilhados", () => {
  assert.match(states, /export function AdminPageSkeleton/);
  assert.match(states, /export function AdminErrorState/);
  assert.match(states, /export function AdminEmptyState/);
  for (const name of ["dashboard", "orders", "history", "menu", "clients", "coupons", "reviews", "settings"]) {
    assert.match(pages[name], /AdminPageSkeleton|OrdersSkeleton/, name + " sem skeleton compartilhado");
    assert.match(pages[name], /AdminErrorState/, name + " sem erro compartilhado");
  }
});

test("calendário administrativo é reutilizado em pedidos dashboard e histórico", () => {
  assert.match(datePicker, /export function AdminDatePicker/);
  assert.match(pages.dashboard, /<AdminDatePicker/);
  assert.match(pages.history, /<AdminDatePicker/);
  assert.match(pages.orders, /<OrdersDatePicker/);
});
`,
);

// Restaura CI e remove o aplicador antes do commit final gerado pela própria action.
const workflowFile = ".github/workflows/ci.yml";
let workflow = read(workflowFile);
workflow = workflow.replace("  contents: write", "  contents: read");
workflow = workflow.replace(
  String.raw`      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: \${{ github.head_ref || github.ref_name }}

      - name: Apply priority 2 visual structure
        run: node scripts/apply-priority2.mjs

      - name: Commit priority 2 visual structure
        if: github.event_name == 'pull_request'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          if ! git diff --cached --quiet; then
            git commit -m "Padronizar estrutura visual administrativa"
            git push
          fi
`,
  String.raw`      - name: Checkout
        uses: actions/checkout@v4
`,
);
write(workflowFile, workflow);
remove("scripts/apply-priority2.mjs");
console.log("Prioridade 2 aplicada com sucesso.");
