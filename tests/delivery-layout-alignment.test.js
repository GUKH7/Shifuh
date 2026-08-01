const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const layout = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery/layout.tsx",
  "utf8",
);
const styles = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery/delivery-layout.css",
  "utf8",
);

test("rota de taxas carrega ajustes locais de distribuição", () => {
  assert.match(layout, /import "\.\/delivery-layout\.css"/);
  assert.match(layout, /className="delivery-settings-route"/);
});

test("faixas individuais usam três campos alinhados e uma ação compacta", () => {
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) 48px/);
  assert.match(styles, /align-items: end/);
  assert.match(styles, /> button\s*> span \{\s*display: none;/);
});

test("campos numéricos ficam empilhados e centralizados no desktop", () => {
  assert.match(styles, /@media \(min-width: 1024px\)/);
  assert.match(styles, /grid-template-columns: 36px minmax\(0, 1fr\) 36px/);
  assert.match(styles, /text-align: center/);
});
