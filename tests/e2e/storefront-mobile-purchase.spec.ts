import { expect, test } from "@playwright/test";

const CART_KEY = "shifuh:cart:loja-e2e";
const ACTIVE_ID = "33333333-3333-4333-8333-333333333333";
const PAUSED_ID = "25252525-2525-4252-8252-252525252525";
const MOBILE_ID = "2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a";

test("mobile: busca, categorias, complementos, sacola e checkout até antes de enviar o pedido", async ({ page }) => {
  let orderPosts = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/orders") && request.method() === "POST") orderPosts++;
  });
  await page.goto("/loja-e2e");

  const search = page.getByRole("searchbox", { name: "Buscar produtos no cardápio" });
  await expect(search).toBeVisible();
  await search.fill("combo mobile");
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await expect(page.locator("[data-category-tab]")).toHaveCount(1);
  await search.fill("");
  await expect(page.locator("[data-category-tab]")).toHaveCount(2);

  await page.getByRole("button", { name: "Combos E2E", exact: true }).click();
  await expect(page.getByRole("button", { name: "Combos E2E", exact: true })).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: /Combo Mobile E2E/ }).click();
  await expect(page.getByText("Falta escolher: Acompanhamento E2E.")).toBeVisible();
  await page.getByRole("button", { name: /Escolher opções/ }).click();
  await expect(page.getByRole("radio", { name: "Arroz E2E" })).toBeVisible();
  await page.getByRole("radio", { name: "Arroz E2E" }).check();
  await page.getByRole("button", { name: /^Adicionar R\$/ }).click();
  await page.getByRole("button", { name: /Abrir sacola com 1 item/ }).click();
  const checkout = page.getByRole("dialog");
  await expect(checkout.getByText("Combo Mobile E2E", { exact: true })).toBeVisible();
  await expect(checkout.getByText("Arroz E2E", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Adicionar mais itens" }).click();
  await expect(search).toBeVisible();
  await page.getByRole("button", { name: /Abrir sacola com 1 item/ }).click();
  await page.getByRole("button", { name: "Escolher recebimento" }).click();
  await page.getByRole("radio", { name: "Retirada" }).click();
  await page.getByLabel("Nome completo").fill("Cliente E2E Mobile");
  await page.getByLabel("Celular com DDD").fill("11988887777");
  await page.getByRole("button", { name: "Ir para pagamento" }).click();
  await page.getByRole("radio", { name: /Pix/ }).check();
  await expect(page.getByRole("button", { name: "Confirmar pedido e enviar à loja" })).toBeEnabled();

  // Intentionally stop before submitting: the fixture uses isolated Supabase,
  // but this test must not create orders in any environment.
  expect(orderPosts).toBe(0);
});

test("mobile: reconcilia sacola antiga sem enviar pedidos ou reutilizar preços antigos", async ({ page }) => {
  const oldProduct = (id: string, name: string, price: number) => ({
    id, name, description: "", price, category_id: "22222222-2222-4222-8222-222222222222",
    image_url: "", is_active: true, addons: [],
  });
  const stored = [
    { internalId: "old-price", product: oldProduct(ACTIVE_ID, "Prato E2E CI", 1),
      quantity: 2, selectedAddons: [], totalPrice: 2, observation: "" },
    { internalId: "old-paused", product: oldProduct(PAUSED_ID, "Prato Pausado E2E", 29.9),
      quantity: 1, selectedAddons: [], totalPrice: 29.9, observation: "" },
    { internalId: "missing-required", product: oldProduct(MOBILE_ID, "Combo Mobile E2E", 24.9),
      quantity: 1, selectedAddons: [], totalPrice: 24.9, observation: "" },
  ];
  await page.addInitScript(([key, cart]) => {
    window.localStorage.setItem(key, JSON.stringify(cart));
  }, [CART_KEY, stored] as const);
  await page.goto("/loja-e2e");
  await expect(page.getByText(/Sacola atualizada:/)).toBeVisible();
  await page.getByRole("button", { name: /Abrir sacola com 2 itens/ }).click();
  const checkout = page.getByRole("dialog");
  await expect(checkout.getByText("Prato E2E CI", { exact: true })).toBeVisible();
  await expect(checkout.getByText("Prato Pausado E2E", { exact: true })).toHaveCount(0);
  await expect(checkout.getByText("Combo Mobile E2E", { exact: true })).toHaveCount(0);
  await expect(checkout.getByText("R$ 39,80").first()).toBeVisible();
  const storedAfter = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), CART_KEY);
  expect(storedAfter).toHaveLength(1);
  expect(storedAfter[0].product.price).toBe(19.9);
  expect(storedAfter[0].totalPrice).toBe(39.8);
});
