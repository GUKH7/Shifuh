"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { filterAvailableStorefrontProducts } = require("../src/features/storefront/catalog/catalog-navigation.ts");

const root = path.join(__dirname, "..");
function read(source) { return fs.readFileSync(path.join(root, source), "utf8"); }

test("only explicitly active products appear; paused and missing flags are hidden", () => {
  const items = [
    { id: "active", is_active: true },
    { id: "paused", is_active: false },
    { id: "missing" },
    { id: "unknown", is_active: null },
  ];
  assert.deepEqual(filterAvailableStorefrontProducts(items).map(item => item.id), ["active"]);
  assert.deepEqual(items.map(item => item.id), ["active", "paused", "missing", "unknown"]);
});

test("public initial payload and live/fallback queries apply the same availability rule", () => {
  const server = read("src/features/storefront/server-data.ts");
  const client = read("src/features/storefront/use-storefront.ts");
  assert.match(server, /const products = filterAvailableStorefrontProducts\(/);
  assert.match(client, /filterAvailableStorefrontProducts\(initialStorefront\?\.products \?\? \[\]\)/);
  assert.match(client, /setProducts\(filterAvailableStorefrontProducts\(prods as Product\[\]\)\)/);
  assert.match(client, /\.from\("public_storefront_products"\)/);
  assert.match(client, /\.from\("products"\)/);
});

test("customer categories, search, featured banners and counts ignore paused products", () => {
  const ui = read("src/features/storefront/StorefrontPage.tsx");
  assert.match(ui, /const availableProducts = filterAvailableStorefrontProducts\(products\)/);
  assert.match(ui, /const totalProducts = availableProducts\.length/);
  assert.match(ui, /const featuredProduct = availableProducts\[0\]/);
  assert.match(ui, /availableProducts\.find\(\(product\) => product\.id === currentBannerProductId\)/);
  assert.match(ui, /availableProducts\.some\(\(product\) => product\.category_id === category\.id\)/);
  assert.match(ui, /const customerProducts = availableProducts\.filter/);
  assert.match(ui, /visibleProducts\.some\(\(product\) => product\.category_id === category\.id\)/);
  assert.match(ui, /customerProducts\.filter\(\(product\) => productMatchesSearch\(product, menuSearch\)\)/);
  assert.match(ui, /\{categoryProducts\.length\} \{categoryProducts\.length === 1 \? "item" : "itens"\}/);
});

test("admin catalog and database are unchanged; no paid preview", () => {
  const testFixture = read("scripts/e2e-seed.mjs");
  assert.match(testFixture, /name: "Prato Pausado E2E"/);
  assert.match(testFixture, /name: "Categoria Pausada E2E"/);
  assert.match(testFixture, /is_active: false/);
  const config = JSON.parse(read("vercel.json"));
  assert.equal(config.git.deploymentEnabled.main, false);
  assert.equal(config.git.deploymentEnabled["fix/hide-paused-storefront-products-20261109"], false);
});
