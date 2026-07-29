const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const menu = fs.readFileSync(path.join(root, "src/app/admin/(painel)/menu/page.tsx"), "utf8");
const storefront = fs.readFileSync(path.join(root, "src/features/storefront/use-storefront.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260729162500_add_category_active.sql"), "utf8");

test("categorias podem ser pausadas sem alterar o estado individual dos produtos", () => {
  const categoryToggle = menu.match(
    /const toggleCategoryStatus = async[\s\S]*?\n  };\n\n  const handleOpenCategoryModal/,
  )?.[0] || "";

  assert.match(categoryToggle, /from\("categories"\)/);
  assert.match(categoryToggle, /update\(\{ is_active: newStatus \}\)/);
  assert.doesNotMatch(categoryToggle, /from\("products"\)/);
  assert.match(menu, /Categoria pausada/);
  assert.match(menu, /Reativar categoria/);
});

test("vitrine carrega somente categorias ativas", () => {
  assert.match(storefront, /from\("categories"\)[\s\S]{0,180}\.eq\("is_active", true\)/);
});

test("migração adiciona disponibilidade de categoria com padrão ativo", () => {
  assert.match(migration, /add column if not exists is_active boolean not null default true/);
});
