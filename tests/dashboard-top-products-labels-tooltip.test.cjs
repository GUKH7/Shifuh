const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const workspace = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const enhancerPath = "src/app/admin/(painel)/DashboardTopProductsEnhancer.tsx";

test("nomes abreviados são criados na origem dos dados do gráfico", () => {
  assert.match(workspace, /type TopProductPoint = \{ name: string; shortName: string; quantity: number \}/);
  assert.match(workspace, /TOP_PRODUCT_LABEL_MAX_LENGTH = 18/);
  assert.match(workspace, /function abbreviateProductName/);
  assert.match(workspace, /shortName: abbreviateProductName\(name\)/);
  assert.match(workspace, /dataKey="shortName"/);
  assert.doesNotMatch(workspace, /<YAxis[^>]+dataKey="name"/);
});

test("tooltip mantém o nome completo do produto", () => {
  assert.match(workspace, /labelFormatter=\{\(label, payload\) =>/);
  assert.match(workspace, /payload\?\.\[0\]\?\.payload as TopProductPoint/);
  assert.match(workspace, /return product\?\.name \|\| String\(label\)/);
  assert.match(workspace, /maxWidth: "min\(280px, calc\(100vw - 2rem\)\)"/);
  assert.match(workspace, /whiteSpace: "normal"/);
});

test("dashboard não manipula mais o SVG depois da renderização", () => {
  assert.doesNotMatch(page, /DashboardTopProductsEnhancer/);
  assert.equal(fs.existsSync(enhancerPath), false);
  assert.doesNotMatch(workspace, /MutationObserver/);
  assert.doesNotMatch(workspace, /ResizeObserver/);
  assert.doesNotMatch(workspace, /querySelectorAll<SVGTextElement>/);
});
