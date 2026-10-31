import { expect, test } from "@playwright/test";

test("commercial sales insights load in an authenticated mobile panel without overflow", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/admin/login");
  await page.getByPlaceholder("seu@email.com").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByPlaceholder("••••••••").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL(url => url.pathname === "/admin", {timeout: 20_000});

  await page.goto("/admin/commercial-actions");
  await expect(page.getByRole("heading", {name:"Ações comerciais"})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Panorama de vendas"})).toBeVisible();
  await expect(page.getByText("Pedidos concluídos", {exact:true})).toBeVisible();
  await expect(page.getByText("Faturamento concluído", {exact:true})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Pontos de atenção"})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
