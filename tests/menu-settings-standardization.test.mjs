import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Cardápios usa skeleton e remove a importação do iFood da interface", async () => {
  const [layout, loading, styles, skeletons] = await Promise.all([
    read("src/app/admin/(painel)/menu/layout.tsx"),
    read("src/app/admin/(painel)/menu/loading.tsx"),
    read("src/app/admin/(painel)/menu/menu-standardization.css"),
    read("src/components/ui/admin-page-skeletons.tsx"),
  ]);

  assert.match(layout, /MenuPageSkeleton/);
  assert.match(loading, /MenuPageSkeleton/);
  assert.match(styles, /button:has\(\.lucide-import\)/);
  assert.match(styles, /display:\s*none\s*!important/);
  assert.match(styles, /max-width:\s*1460px/);
  assert.match(skeletons, /export function MenuPageSkeleton/);
  assert.doesNotMatch(skeletons, /Loader2|animate-spin/);
});

test("Configurações usa skeleton e controles padronizados", async () => {
  const [layout, loading, styles, skeletons] = await Promise.all([
    read("src/app/admin/(painel)/settings/layout.tsx"),
    read("src/app/admin/(painel)/settings/loading.tsx"),
    read("src/app/admin/(painel)/settings/settings-standardization.css"),
    read("src/components/ui/admin-page-skeletons.tsx"),
  ]);

  assert.match(layout, /SettingsPageSkeleton/);
  assert.match(loading, /SettingsPageSkeleton/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /border-color:\s*var\(--brand\)/);
  assert.match(styles, /padding-right:\s*2\.75rem/);
  assert.match(styles, /max-width:\s*1460px/);
  assert.match(skeletons, /export function SettingsPageSkeleton/);
});
