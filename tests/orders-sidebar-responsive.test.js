import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL(
  "../src/app/admin/(painel)/orders/orders-header-responsive.css",
  import.meta.url,
);

test("a tabela de pedidos se adapta quando o sidebar está expandido", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /@media \(min-width: 1280px\) and \(max-width: 1439px\)/);
  assert.match(css, /\.lg\\:ml-56 \.admin-panel-content \.orders-table-row/);
  assert.match(css, /\.orders-table-row[\s\S]*190px !important/);
  assert.match(css, /\.orders-drawer-open \.orders-table-row[\s\S]*170px !important/);
  assert.doesNotMatch(css, /container-type:\s*inline-size/);
});

test("resumo inferior ignora largura da sidebar quando ela ainda é móvel", async () => {
  const css = await readFile(cssPath, "utf8");
  const tabletRule = css.match(
    /@media \(min-width: 768px\) and \(max-width: 1023px\) \{([\s\S]*?)\n\}/,
  )?.[1] ?? "";

  assert.match(tabletRule, /\.admin-page-shell > section:last-child/);
  assert.match(tabletRule, /right:\s*1\.5rem !important/);
  assert.match(tabletRule, /left:\s*1\.5rem !important/);
  assert.match(tabletRule, /max-width:\s*none !important/);
  assert.match(tabletRule, /margin-right:\s*0 !important/);
  assert.match(tabletRule, /margin-left:\s*0 !important/);
  assert.match(css, /flex-wrap:\s*wrap/);
  assert.match(css, /white-space:\s*normal/);
});
