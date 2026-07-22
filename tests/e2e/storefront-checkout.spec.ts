import { expect, test, type Page } from "@playwright/test";

const RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

function restaurant(closed = false) {
  return {
    id: RESTAURANT_ID,
    slug: "loja-e2e",
    name: "Loja E2E",
    description: "Cardápio de teste",
    primary_color: "#b42318",
    phone: "11999999999",
    latitude: -23.5505,
    longitude: -46.6333,
    address_neighborhood: "Centro",
    address_city: "São Paulo",
    address_state: "SP",
    work_hours: closed
      ? Array.from({ length: 7 }, (_, dayId) => ({ day_id: dayId, is_open: false }))
      : [],
    delivery_tiers: [{ distance: 5, price: 5, time: 30 }],
    storefront_theme: { show_banners: false, show_logo: false },
    minimum_order_amount: 0,
    pickup_enabled: false,
    scheduled_orders_enabled: false,
    banners: [],
  };
}

async function mockStorefront(page: Page, closed = false) {
  await page.route("**/auth/v1/user**", (route) => route.fulfill({ status: 401, body: "{}" }));
  await page.route("**/rest/v1/public_restaurants**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(restaurant(closed)),
  }));
  await page.route("**/rest/v1/categories**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ id: CATEGORY_ID, restaurant_id: RESTAURANT_ID, name: "Pratos", order: 1 }]),
  }));
  await page.route("**/rest/v1/public_storefront_products**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{
      id: PRODUCT_ID,
      restaurant_id: RESTAURANT_ID,
      category_id: CATEGORY_ID,
      name: "Prato executivo",
      description: "Arroz, feijão e salada",
      price: 19.9,
      image_url: "",
      is_active: true,
      addons: [],
    }]),
  }));
  await page.route("**/api/storefront/checkout-events", (route) => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ accepted: true }),
  }));
}

async function addProductAndOpenCheckout(page: Page) {
  await page.goto("/loja-e2e");
  await page.getByRole("button", { name: /Prato executivo/ }).click();
  await page.getByRole("button", { name: /^Adicionar/ }).click();
  await page.getByRole("button", { name: /Ver pedido|Ver sacola/ }).click();
}

async function reachAddress(page: Page) {
  await addProductAndOpenCheckout(page);
  await page.getByRole("button", { name: /Continuar para entrega/ }).click();
  await page.getByLabel("Nome completo").fill("Cliente Teste");
  await page.getByLabel("Celular com DDD").fill("11999999999");
  await page.getByLabel("CEP").fill("01001000");
  await page.getByLabel("Rua").fill("Praça da Sé");
  await page.getByLabel("Número").fill("100");
  await page.getByLabel("Bairro").fill("Sé");
  await page.getByLabel("Cidade").fill("São Paulo");
  await page.getByLabel("UF").fill("SP");
}

test("loja aberta permite iniciar o checkout e mantém foco dentro do diálogo", async ({ page }) => {
  await mockStorefront(page);
  await addProductAndOpenCheckout(page);

  await expect(page.getByText("Aberto", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Sua sacola/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continuar para entrega/ })).toBeEnabled();
});

test("loja fechada preserva a sacola e bloqueia o pedido imediato", async ({ page }) => {
  await mockStorefront(page, true);
  await addProductAndOpenCheckout(page);

  await expect(page.getByText("Fechado", { exact: true })).toBeVisible();
  await expect(page.getByText(/Loja fechada no momento/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Loja fechada no momento/ })).toBeDisabled();
});

test("endereço fora da área recebe explicação amigável", async ({ page }) => {
  await mockStorefront(page);
  await page.route("https://viacep.com.br/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ logradouro: "Praça da Sé", bairro: "Sé", localidade: "São Paulo", uf: "SP" }),
  }));
  await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ lat: "-22.0000", lon: "-43.0000", address: { city: "São Paulo", state: "SP" } }]),
  }));

  await reachAddress(page);
  await page.getByRole("button", { name: /Calcular taxa e prazo/ }).click();

  await expect(page.getByRole("alert").filter({ hasText: /fora da área/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /fora da área de entrega/ })).toBeDisabled();
});

test("falha externa mantém os campos e oferece nova tentativa sem erro técnico", async ({ page }) => {
  await mockStorefront(page);
  await page.route("https://viacep.com.br/**", (route) => route.fulfill({ status: 503, body: "indisponível" }));
  await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 503, body: "indisponível" }));

  await reachAddress(page);
  await page.getByRole("button", { name: /Calcular taxa e prazo/ }).click();

  await expect(page.getByRole("alert").filter({ hasText: /localizamos|tente novamente/i })).toBeVisible();
  await expect(page.getByLabel("Rua")).toHaveValue("Praça da Sé");
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expect(page.getByText(/JSON|503|Unexpected/i)).toHaveCount(0);
});
