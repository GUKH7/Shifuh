import { expect, test } from "@playwright/test";

test("cardápio público omite produtos pausados e categorias vazias, mas mantém itens ativos", async ({ page }) => {
  await page.goto("/loja-e2e");

  await expect(page.getByRole("heading", { name: "Loja E2E CI", level: 1 })).toBeVisible();

  // The local fixture has three products: one active and two paused.
  // One of the paused items is in an otherwise empty active category.
  const productCards = page.locator("[data-product-card]");
  await expect(productCards).toHaveCount(1);
  await expect(productCards.first()).toContainText("Prato E2E CI");
  await expect(page.locator("[data-category-tab]")).toHaveCount(1);
  await expect(page.getByText("Categoria Pausada E2E", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Prato Pausado E2E", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Produto Exclusivo Pausado E2E", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Indisponível", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 item", { exact: true })).toBeVisible();

  const search = page.getByPlaceholder("Buscar no cardápio");
  await search.fill("pausado");
  await expect(productCards).toHaveCount(0);
  await expect(page.getByText("Nenhum item encontrado")).toBeVisible();

  await search.fill("prato e2e");
  await expect(productCards).toHaveCount(1);
  await expect(productCards.first()).toContainText("Prato E2E CI");
  await expect(page.getByText("Prato Pausado E2E", { exact: true })).toHaveCount(0);
});
