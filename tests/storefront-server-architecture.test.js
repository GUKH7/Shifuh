import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("a rota da vitrine é um componente de servidor com metadata dinâmica", async () => {
  const [page, layout] = await Promise.all([
    read("src/app/[slug]/page.tsx"),
    read("src/app/[slug]/layout.tsx"),
  ]);

  assert.doesNotMatch(page, /["']use client["']/);
  assert.match(page, /StorefrontClient/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /getPublicStorefrontData/);
  assert.match(layout, /StorefrontInitialDataProvider/);
  assert.match(layout, /revalidate\s*=\s*60/);
});

test("consultas públicas ficam centralizadas no servidor e na API", async () => {
  const [loader, route, hook] = await Promise.all([
    read("src/lib/storefront/public-data.ts"),
    read("src/app/api/storefront/[slug]/route.ts"),
    read("src/features/storefront/use-storefront.ts"),
  ]);

  assert.match(loader, /public_restaurants/);
  assert.match(loader, /public_storefront_products/);
  assert.doesNotMatch(loader, /\.from\(["']restaurants["']\)/);
  assert.doesNotMatch(loader, /\.from\(["']products["']\)/);
  assert.match(route, /checkRateLimit/);
  assert.match(route, /Cache-Control/);
  assert.match(hook, /\/api\/storefront\//);
  assert.doesNotMatch(hook, /public_restaurants/);
  assert.doesNotMatch(hook, /public_storefront_products/);
  assert.doesNotMatch(hook, /\.from\(["']categories["']\)/);
});

test("responsabilidades grandes da vitrine estão separadas", async () => {
  const [client, session, navigation, provider] = await Promise.all([
    read("src/features/storefront/StorefrontClient.tsx"),
    read("src/features/storefront/use-storefront-session.ts"),
    read("src/features/storefront/use-storefront-navigation.ts"),
    read("src/features/storefront/StorefrontInitialDataProvider.tsx"),
  ]);

  assert.match(client, /useStorefront/);
  assert.match(session, /useStorefrontSession/);
  assert.match(navigation, /useStorefrontNavigation/);
  assert.match(provider, /StorefrontInitialDataProvider/);
});

test("a vitrine possui auditoria visual específica e paralela", async () => {
  const [config, spec, workflow, packageJson] = await Promise.all([
    read("playwright.storefront.config.ts"),
    read("tests/visual/storefront-visual.spec.ts"),
    read(".github/workflows/storefront-visual-audit.yml"),
    read("package.json"),
  ]);

  assert.match(config, /fullyParallel:\s*true/);
  assert.match(config, /name:\s*["']mobile["']/);
  assert.match(config, /name:\s*["']tablet["']/);
  assert.match(config, /name:\s*["']desktop["']/);
  assert.match(spec, /horizontalOverflow/);
  assert.match(workflow, /Auditoria visual da vitrine/);
  assert.match(packageJson, /visual:storefront/);
});
