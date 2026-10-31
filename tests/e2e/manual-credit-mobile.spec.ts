import { expect, test } from "@playwright/test";

test("manual loyalty credit can be reviewed and credited on mobile", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/admin/login");
  await page.getByPlaceholder("seu@email.com").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByPlaceholder("••••••••").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL(url => url.pathname === "/admin", { timeout: 20_000 });
  await page.goto("/admin/promotions/loyalty");
  const section = page.getByRole("region", { name: "Crédito por compra presencial" });
  await expect(section).toBeVisible();
  await section.getByRole("combobox", { name: "Cliente" }).selectOption("44444444-4444-4444-8444-444444444444");
  await section.getByRole("button", { name: "Pontos diretos" }).click();
  await section.getByRole("textbox", { name: "Quantidade de pontos" }).fill("3");
  await expect(section.getByText("+3 pontos")).toBeVisible();
  await section.getByRole("button", { name: "Revisar crédito" }).click();
  await expect(section.getByRole("button", { name: "Confirmar crédito" })).toBeEnabled();
  await section.getByRole("button", { name: "Confirmar crédito" }).click();
  await expect(section.getByText("Crédito confirmado e registrado no extrato.")).toBeVisible({ timeout: 15_000 });
  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
});
