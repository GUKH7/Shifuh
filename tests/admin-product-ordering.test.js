const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const menu = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "admin", "(painel)", "menu", "page.tsx"),
  "utf8",
);
const storefront = fs.readFileSync(
  path.join(__dirname, "..", "src", "features", "storefront", "use-storefront.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260914004500_product_manual_sort_order.sql",
  ),
  "utf8",
);

test("cardápio oferece ordem manual e persiste o drag por RPC", () => {
  assert.match(menu, /type SortKey = "manual" \| "name" \| "price"/);
  assert.match(menu, /Ordem manual/);
  assert.match(menu, /handleProductDragStart/);
  assert.match(menu, /handleProductDragOver/);
  assert.match(menu, /reorder_products/);
  assert.match(menu, /Arraste os produtos pelo ícone de alça/);
});

test("reordenação fica bloqueada durante busca para não salvar lista parcial", () => {
  assert.match(
    menu,
    /sortBy === "manual" && !searchTerm\.trim\(\) && !isSavingProductOrder/,
  );
  assert.match(menu, /Limpe a busca para arrastar e reposicionar os produtos/);
});

test("schema persiste sort_order e storefront respeita a posição", () => {
  assert.match(migration, /add column if not exists sort_order integer/i);
  assert.match(migration, /create or replace function public\.reorder_products/i);
  assert.match(migration, /p\.sort_order/);
  assert.match(migration, /jsonb_agg\(to_jsonb\(p\) order by c\."order", p\.sort_order/);
  assert.match(storefront, /\.order\("sort_order", \{ ascending: true \}\)/);
});
