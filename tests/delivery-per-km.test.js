const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const settings = fs.readFileSync("src/features/settings/SettingsWorkspace.tsx", "utf8");
const sections = fs.readFileSync("src/features/settings/SettingsSections.tsx", "utf8");
const enhancer = fs.readFileSync("src/features/settings/DeliveryRulesEnhancer.tsx", "utf8");
const deliveryPricing = fs.readFileSync("src/features/settings/delivery-pricing.ts", "utf8");
const geo = fs.readFileSync("src/lib/geo.ts", "utf8");

test("configurações mantêm o editor de taxas na própria página", () => {
  assert.match(settings, /Taxas de entrega/);
  assert.doesNotMatch(sections, /\/admin\/settings\/delivery/);
  assert.match(enhancer, /Gere as faixas automaticamente e edite exceções depois/);
  assert.match(settings, /deliveryPricingMode === "per_km"/);
  assert.match(settings, /delivery_tiers: deliveryRules/);
});

test("gerador cria preço acumulado e prazo progressivo por quilometragem", () => {
  assert.match(deliveryPricing, /Array\.from\(\{ length: wholeKilometers \}/);
  assert.match(deliveryPricing, /Math\.ceil\(distance\)/);
  assert.match(deliveryPricing, /billedDistance \* normalizedPrice/);
  assert.match(deliveryPricing, /normalizedInitialTime \+ timeRange \* progress/);
  assert.match(deliveryPricing, /hasFractionalLimit/);
});

test("faixas geradas permanecem editáveis antes de salvar", () => {
  assert.match(settings, /const updateTier =/);
  assert.match(settings, /updateTier\(index, "time"/);
  assert.match(settings, /updateTier\(index, "price"/);
  assert.match(settings, /const addTier =/);
  assert.match(settings, /const removeTier =/);
});

test("cálculo legado por km continua compatível até a conversão", () => {
  assert.match(geo, /tier\?\.mode === "per_km"/);
  assert.match(geo, /Math\.ceil\(distance\)/);
  assert.match(geo, /distance > maxDistance/);
  assert.match(geo, /billedDistance \* pricePerKm/);
});

test("modo por faixas continua disponível no checkout", () => {
  assert.match(geo, /sortedTiers\.find\(\(tier\) => distance <= Number\(tier\.distance\)\)/);
});
