import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content);
const replaceOnce = (file, before, after) => {
  const source = read(file);
  if (!source.includes(before)) throw new Error(`Trecho não encontrado em ${file}`);
  write(file, source.replace(before, after));
};

const menu = "src/app/admin/(painel)/menu/page.tsx";
replaceOnce(
  menu,
  '<div key={product.id} className="group flex min-w-0 flex-wrap items-center gap-4 px-5 py-4 sm:flex-nowrap">',
  '<div key={product.id} className="menu-product-row group flex min-w-0 flex-wrap items-center gap-4 px-5 py-4 sm:flex-nowrap">',
);
replaceOnce(
  menu,
  '<p className="truncate font-bold text-gray-950">{product.name}</p>',
  '<p className="menu-product-name truncate font-bold text-gray-950">{product.name}</p>',
);
replaceOnce(
  menu,
  '<div className="ml-20 flex flex-shrink-0 items-center gap-2 opacity-100 transition-opacity sm:ml-0 md:opacity-0 md:group-hover:opacity-100">',
  '<div className="menu-product-actions ml-20 flex flex-shrink-0 items-center gap-2 opacity-100 transition-opacity sm:ml-0 md:opacity-0 md:group-hover:opacity-100">',
);
replaceOnce(
  menu,
  `                                <button
                                  onClick={() => handleEditProduct(product)}
                                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-600"
                                >
                                  Editar
                                </button>`,
  `                                <button
                                  onClick={() => handleEditProduct(product)}
                                  className="menu-product-edit admin-button border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-600"
                                  aria-label={\`Editar produto ${product.name}\`}
                                >
                                  <Edit3 size={15} aria-hidden="true" />
                                  <span className="menu-product-edit-label">Editar</span>
                                </button>`,
);

const responsive = "src/app/admin/(painel)/admin-responsive.css";
let css = read(responsive);
css = css.replace(
  '.admin-page-shell :where(button, a[href], input, select, textarea, [role="button"]):focus-visible,',
  '.admin-control:focus-visible,\n.admin-page-shell :where(button, a[href], input, select, textarea, [role="button"]):focus-visible,',
);
css += `

.menu-product-name {
  overflow-wrap: anywhere;
}

@media (max-width: 1023px) {
  .admin-page-shell .overflow-x-auto {
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }

  .admin-page-header-action {
    max-width: 100%;
  }
}

@media (max-width: 639px) {
  .menu-product-row {
    align-items: flex-start;
  }

  .menu-product-name {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  .menu-product-actions {
    margin-left: auto;
  }

  .menu-product-edit {
    width: var(--admin-control-height);
    min-width: var(--admin-control-height);
    padding-inline: 0;
  }

  .menu-product-edit-label {
    display: none;
  }
}
`;
write(responsive, css);

write("tests/admin-menu-mobile-product.test.js", `const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const menu = fs.readFileSync("src/app/admin/(painel)/menu/page.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");

test("nomes de produtos quebram corretamente no cardápio mobile", () => {
  assert.match(menu, /menu-product-name/);
  assert.match(responsive, /\\.menu-product-name[\\s\\S]*overflow-wrap: anywhere/);
  assert.match(responsive, /white-space: normal/);
});

test("ação de editar usa classe semântica e rótulo acessível", () => {
  assert.match(menu, /menu-product-edit/);
  assert.match(menu, /aria-label=\\{`Editar produto \\${product\\.name}`\\}/);
  assert.match(menu, /<Edit3 size=\\{15\\}/);
  assert.match(responsive, /\\.menu-product-edit[\\s\\S]*width: var\\(--admin-control-height\\)/);
  assert.match(responsive, /\\.menu-product-edit-label[\\s\\S]*display: none/);
});
`);

write("tests/admin-responsive-breakpoints.test.js", `const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");

test("stylesheet define breakpoints sem depender de classes Tailwind", () => {
  assert.match(responsive, /@media \\(max-width: 639px\\)/);
  assert.match(responsive, /@media \\(max-width: 767px\\)/);
  assert.match(responsive, /@media \\(max-width: 1023px\\)/);
  assert.doesNotMatch(responsive, /\\[class\\*=/);
  assert.doesNotMatch(responsive, /nth-child|first-child|last-child|:has/);
});
`);

write("tests/admin-ui-foundation.test.mjs", `import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const primitives = fs.readFileSync("src/components/ui/admin-primitives.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");
const globals = fs.readFileSync("src/app/globals.css", "utf8");

test("controles administrativos usam tokens compartilhados", () => {
  assert.match(globals, /--admin-control-height: 44px/);
  assert.match(globals, /--admin-radius-control: 14px/);
  assert.match(globals, /--admin-radius-card: 24px/);
  assert.match(primitives, /admin-control/);
  assert.match(primitives, /admin-button/);
});

test("controles administrativos usam foco laranja e selects padronizados", () => {
  assert.match(responsive, /admin-control:focus-visible/);
  assert.match(responsive, /border-color: var\\(--brand\\)/);
  assert.match(responsive, /admin-select/);
  assert.match(responsive, /padding-right: 2\\.75rem/);
});
`);

write("tests/dashboard-metric-label-nowrap.test.cjs", `const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("títulos dos cards de métricas não quebram em duas linhas", () => {
  assert.match(dashboard, /dashboard-metric-card-label/);
  assert.match(styles, /dashboard-metric-card-label[\\s\\S]*white-space: nowrap/);
  assert.doesNotMatch(styles, /\\[class\\*=/);
});
`);

write("tests/dashboard-period-container.test.cjs", `const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("container do período usa classe semântica e permanece acima dos gráficos ao focar", () => {
  assert.match(dashboard, /dashboard-period-control/);
  assert.match(styles, /dashboard-period-control:focus-within/);
  assert.match(styles, /z-index: 120/);
  assert.doesNotMatch(styles, /button\\[aria-expanded="true"\\]|:has/);
});
`);

write("tests/dashboard-period-filter.test.cjs", `const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("filtro global do dashboard tem hierarquia foco e responsividade", () => {
  assert.match(dashboard, /dashboard-period-control/);
  assert.match(dashboard, /id="dashboard-period"/);
  assert.match(styles, /dashboard-period-control/);
  assert.match(styles, /dashboard-period-control:focus-within/);
  assert.match(styles, /@media \\(max-width: 639px\\)/);
  assert.doesNotMatch(styles, /:has|nth-child|first-child|\\[class\\*=/);
});
`);

console.log("Ajustes responsivos da prioridade 3 aplicados.");
