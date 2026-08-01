const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery/page.tsx",
  "utf8",
);
const numberField = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery/DeliveryNumberField.tsx",
  "utf8",
);
const rootLayout = fs.readFileSync("src/app/layout.tsx", "utf8");

test("campos de entrega permitem apagar e digitar antes de normalizar", () => {
  assert.match(numberField, /type="text"/);
  assert.match(numberField, /inputMode=\{decimals > 0 \? "decimal" : "numeric"\}/);
  assert.match(numberField, /const decimalPattern =/);
  assert.match(numberField, /replace\(",", "\."\)/);
  assert.match(numberField, /parsed \?\? value/);
  assert.doesNotMatch(page, /Number\(event\.target\.value\) \|\| 0\.1/);
});

test("editor permanece simples e compacto em celulares e tablets", () => {
  assert.match(numberField, /grid-cols-\[108px_minmax\(0,1fr\)\]/);
  assert.match(numberField, /grid-cols-\[minmax\(0,1fr\)\]/);
  assert.match(numberField, /min-h-10/);
  assert.match(numberField, /hidden min-h-11.*xl:inline-flex/);
  assert.match(numberField, /xl:grid-cols-\[36px_minmax\(0,1fr\)_36px\]/);
  assert.doesNotMatch(numberField, /sm:inline-flex/);
  assert.doesNotMatch(numberField, /grid-cols-\[40px_minmax\(0,1fr\)_40px\]/);
});

test("valores permanecem centralizados em todas as larguras", () => {
  assert.match(numberField, /py-2 text-center text-sm/);
  assert.doesNotMatch(numberField, /text-right/);
  assert.doesNotMatch(numberField, /xl:text-center/);
});

test("viewport usa a largura real do dispositivo", () => {
  assert.match(rootLayout, /import type \{ Metadata, Viewport \} from "next"/);
  assert.match(rootLayout, /export const viewport: Viewport/);
  assert.match(rootLayout, /width: "device-width"/);
  assert.match(rootLayout, /initialScale: 1/);
});

test("digitação mantém atalhos e descrição acessível", () => {
  assert.match(numberField, /event\.currentTarget\.select\(\)/);
  assert.match(numberField, /event\.key === "ArrowUp" \|\| event\.key === "ArrowDown"/);
  assert.match(numberField, /aria-describedby=\{error \|\| hint \? descriptionId : undefined\}/);
  assert.match(numberField, /useId\(\)/);
  assert.match(numberField, /className="sr-only"/);
});

test("layout evita campos lado a lado em celulares", () => {
  assert.match(page, /lg:grid-cols-2 2xl:grid-cols-4/);
  assert.doesNotMatch(page, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(page, /key=\{tier\.editorId\}/);
  assert.doesNotMatch(page, /key=\{index\}/);
  assert.doesNotMatch(page, /key=\{`\$\{tier\.distance\}-\$\{index\}`\}/);
});
