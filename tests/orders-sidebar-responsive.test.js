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
