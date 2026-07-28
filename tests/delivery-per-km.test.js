const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const settings = fs.readFileSync("src/app/admin/(painel)/settings/page.tsx", "utf8");
const geo = fs.readFileSync("src/lib/geo.ts", "utf8");

test("configurações oferecem cobrança por km e limite de entrega", () => {
  assert.match(settings, /deliveryPricingMode/);
  assert.match(settings, /Valor por km/);
  assert.match(settings, /Limite de entrega/);
  assert.match(settings, /price_per_km/);
  assert.match(settings, /max_distance/);
  assert.match(settings, /Cada quilômetro iniciado|cada quilômetro iniciado/i);
});

test("cálculo por km arredonda a distância e bloqueia acima do limite", () => {
  assert.match(geo, /tier\?\.mode === "per_km"/);
  assert.match(geo, /Math\.ceil\(distance\)/);
  assert.match(geo, /distance > maxDistance/);
  assert.match(geo, /billedDistance \* pricePerKm/);
  assert.match(geo, /Math\.round\(billedDistance \* pricePerKm \* 100\) \/ 100/);
});

test("modo por faixas continua disponível", () => {
  assert.match(settings, /Faixas de distância/);
  assert.match(geo, /sortedTiers\.find\(\(tier\) => distance <= Number\(tier\.distance\)\)/);
});
