import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routingSource = readFileSync("src/lib/routing.ts", "utf8");
const quoteSource = readFileSync("src/lib/delivery-quote.ts", "utf8");
const quoteRouteSource = readFileSync("src/app/api/storefront/delivery-quote/route.ts", "utf8");
const orderRouteSource = readFileSync("src/app/api/orders/route.ts", "utf8");
const storefrontSource = readFileSync("src/app/[slug]/page.tsx", "utf8");
const calculatorSource = readFileSync("src/features/storefront/DeliveryCalculator.tsx", "utf8");

test("calcula a taxa pela rota viária no servidor", () => {
  assert.match(routingSource, /route\/v1\/driving/);
  assert.match(routingSource, /distanceMeters \/ 1000/);
  assert.match(quoteSource, /getRoadRoute/);
  assert.match(quoteSource, /distanceMethod: "road_route"/);
  assert.match(quoteRouteSource, /calculateDeliveryQuote/);
});

test("checkout e criação do pedido usam a mesma cotação", () => {
  assert.match(storefrontSource, /\/api\/storefront\/delivery-quote/);
  assert.doesNotMatch(storefrontSource, /calculateDistance\(/);
  assert.match(orderRouteSource, /calculateDeliveryQuote/);
  assert.match(orderRouteSource, /distance_method: fulfillmentType === "delivery" \? "road_route"/);
  assert.doesNotMatch(orderRouteSource, /"straight_line"/);
});

test("a vitrine explica que a distância segue o trajeto viário", () => {
  assert.match(calculatorSource, /rota|trajeto viário/i);
  assert.doesNotMatch(calculatorSource, /linha reta/i);
});
