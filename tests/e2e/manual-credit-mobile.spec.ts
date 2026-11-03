import { expect, test } from "@playwright/test";

test("manual loyalty credit can be reviewed and credited on mobile", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/admin/login");
  await page.getByPlaceholder("seu@email.com").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByPlaceholder("••••••••").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL(url => url.pathname === "/admin", { timeout: 20_000 });
  // A cashier should reach the credit form from the dashboard in one tap.
  await expect(page.getByRole("link", { name: "Adicionar pontos de fidelidade" })).toBeVisible();
  await page.locator("header.admin-panel-header").getByRole("link", { name: "Adicionar pontos" }).click();
  await expect(page).toHaveURL(/\/admin\/pontos$/);
  await expect(page.getByRole("heading", { name: "Adicionar pontos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gerenciar fidelidade" })).toBeVisible();
  const section = page.getByRole("region", { name: "Crédito por compra presencial" });
  await expect(section).toBeVisible();
  const search = section.getByRole("searchbox", { name: "Buscar cliente" });
  // Other commercial tests may update the fixture's name; use its stable phone to
  // discover the real rendered name, then validate searching by that name.
  await search.fill("988887777");
  const customerCard = section.locator('[data-customer-id="44444444-4444-4444-8444-444444444444"]');
  await expect(customerCard).toContainText("(11) 98888-7777");
  const shownName = (await customerCard.getByTestId("manual-credit-customer-name").textContent())?.trim();
  expect(shownName).toBeTruthy();
  await search.fill(shownName!);
  await expect(customerCard).toBeVisible();
  await search.fill("988887777");
  await expect(customerCard).toBeVisible();
  await customerCard.click();
  await expect(customerCard).toHaveAttribute("aria-pressed", "true");
  await expect(section.getByText("Cliente selecionado")).toBeVisible();
  await expect(section.getByText("Saldo atual")).toBeVisible();
  await section.getByRole("button", { name: "Pontos diretos" }).click();
  await section.getByRole("textbox", { name: "Quantidade de pontos" }).fill("3");
  await expect(section.getByText("+3 pontos")).toBeVisible();
  await section.getByRole("button", { name: "Revisar crédito" }).click();
  await expect(section.getByRole("button", { name: "Confirmar crédito" })).toBeEnabled();
  await section.getByRole("button", { name: "Confirmar crédito" }).click();
  await expect(section.getByText("Crédito confirmado e registrado no extrato.")).toBeVisible({ timeout: 15_000 });
  await search.fill("");
  await expect(section.getByText("Recentes neste dispositivo")).toBeVisible();
  await expect(section.locator('[data-customer-id="44444444-4444-4444-8444-444444444444"]')).toBeVisible();
  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
});
