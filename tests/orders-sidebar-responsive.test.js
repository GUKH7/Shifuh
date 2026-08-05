import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL(
  "../src/app/admin/(painel)/orders/orders-header-responsive.css",
  import.meta.url,
);

test("a tabela de pedidos se adapta à largura útil do painel", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /container-name:\s*orders-panel/);
  assert.match(css, /@container orders-panel \(max-width: 1160px\)/);
  assert.match(css, /\.orders-table-row[\s\S]*190px !important/);
  assert.match(css, /\.orders-drawer-open \.orders-table-row[\s\S]*170px !important/);
});
