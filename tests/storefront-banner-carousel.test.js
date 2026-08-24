const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontPage = fs.readFileSync(path.join(root, "src/features/storefront/StorefrontPage.tsx"), "utf8");
const storefrontHook = fs.readFileSync(path.join(root, "src/features/storefront/use-storefront.ts"), "utf8");
const settings = fs.readFileSync(path.join(root, "src/features/settings/SettingsWorkspace.tsx"), "utf8");
const storefrontTypes = fs.readFileSync(path.join(root, "src/features/storefront/types.ts"), "utf8");
const storefrontLayout = fs.readFileSync(path.join(root, "src/app/[slug]/layout.module.css"), "utf8");

test("carrossel do topo mantém rotação automática e permite navegação manual", () => {
  assert.match(storefrontHook, /setCurrentBanner/);
  assert.match(storefrontHook, /5000/);
  assert.match(storefrontPage, /Banner anterior/);
  assert.match(storefrontPage, /Próximo banner/);
  assert.match(storefrontPage, /handleBannerTouchStart/);
  assert.match(storefrontPage, /Exibir banner/);
});

test("banner pode abrir um produto vinculado sem sair da vitrine", () => {
  assert.match(storefrontTypes, /banner_product_links: Record<string, string>/);
  assert.match(storefrontPage, /data-banner-product-link/);
  assert.match(storefrontPage, /openProduct\(currentBannerProduct\)/);
  assert.match(settings, /Produto ao clicar/);
  assert.match(settings, /Sem produto vinculado/);
  assert.match(settings, /updateBannerProductLink/);
});

test("remoção do banner também remove seu vínculo de produto", () => {
  assert.match(settings, /delete nextLinks\[bannerUrl\]/);
  assert.match(settings, /removeBanner\(banner, index\)/);
});

test("banner exibido usa a mesma proporção informada e aplicada no recorte das configurações", () => {
  assert.match(storefrontLayout, /aspect-ratio:\s*16\s*\/\s*7/);
  assert.match(settings, /setCropAspect\(target === "logo" \? 1 : 16 \/ 7\)/);
  assert.match(settings, /proporção horizontal `16:7`/);
  assert.match(settings, /1600x700 px/);
});
