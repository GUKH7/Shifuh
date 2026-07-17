import assert from "node:assert/strict";
import test from "node:test";

import {
  isHomologationCategory,
  productMatchesSearch,
} from "../src/features/storefront/catalog-navigation.ts";

const product = {
  name: "Espeto de carne",
  description: "Carne bovina assada na brasa",
  addons: [
    {
      title: "Molhos",
      options: [{ name: "Maionese verde" }, { name: "Barbecue" }],
    },
  ],
};

test("identifies homologation categories regardless of accents and case", () => {
  assert.equal(isHomologationCategory("Teste Homologação"), true);
  assert.equal(isHomologationCategory("HOMOLOGACAO IFOOD"), true);
  assert.equal(isHomologationCategory("Espetos"), false);
});

test("searches products by name, description, addon group and addon option", () => {
  assert.equal(productMatchesSearch(product, "espeto"), true);
  assert.equal(productMatchesSearch(product, "bovina"), true);
  assert.equal(productMatchesSearch(product, "molhos"), true);
  assert.equal(productMatchesSearch(product, "maionese"), true);
  assert.equal(productMatchesSearch(product, "sobremesa"), false);
});
