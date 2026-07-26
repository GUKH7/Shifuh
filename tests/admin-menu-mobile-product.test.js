const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const menu = fs.readFileSync(
  path.join(root, "src", "app", "admin", "(painel)", "menu", "page.tsx"),
  "utf8",
);
const responsive = fs.readFileSync(
  path.join(root, "src", "app", "admin", "(painel)", "admin-responsive.css"),
  "utf8",
);

test("nomes de produtos deixam de truncar no cardápio mobile", () => {
  assert.match(menu, /<p className="truncate font-bold text-gray-950">\{product\.name\}<\/p>/);
  assert.match(
    responsive,
    /p\.truncate\.font-bold[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: normal;/,
  );
});

test("ação de editar vira ícone de lápis apenas no mobile", () => {
  assert.match(menu, />\s*Editar\s*<\/button>/);
  assert.match(responsive, /@media \(max-width: 767px\)/);
  assert.match(
    responsive,
    /button:first-child \{[\s\S]*font-size: 0;[\s\S]*height: 2\.5rem;[\s\S]*width: 2\.5rem;/,
  );
  assert.match(responsive, /button:first-child::before[\s\S]*background-image: url\("data:image\/svg\+xml/);
});
