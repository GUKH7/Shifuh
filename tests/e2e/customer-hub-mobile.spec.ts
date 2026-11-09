import { expect, test } from "@playwright/test";

test("Central de Clientes combina cadastro presencial, compras e fidelidade no celular", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/admin/login");
  await page.getByPlaceholder("seu@email.com").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByPlaceholder("••••••••").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL(url => url.pathname === "/admin", { timeout: 20_000 });

  // The seeded account has two completed sales, but may have changing names elsewhere in CI.
  await page.goto("/admin/clients");
  await expect(page.getByRole("heading", { name: "Central de Clientes" })).toBeVisible();
  const known = page.locator('[data-customer-phone="11988887777"]');
  await expect(known).toBeVisible({ timeout: 15_000 });
  await expect(known.getByText("2", { exact: true })).toBeVisible();
  await known.getByRole("button", { name: "Ver histórico" }).click();
  await expect(known.getByRole("region", { name: /Histórico de/ })).toBeVisible();
  await expect(known.getByText("Histórico de fidelidade")).toBeVisible();
  await expect(known.getByText("Últimos pedidos")).toBeVisible();

  // Create a registered walk-in client without orders, then find it in the CRM.
  await page.goto("/admin/pontos");
  const manual = page.getByRole("region", { name: "Crédito por compra presencial" });
  await manual.getByRole("button", { name: /Novo cliente presencial/ }).click();
  const form = manual.getByRole("form", { name: "Cadastrar cliente presencial" });
  await form.getByRole("textbox", { name: "Nome" }).fill("Cliente Central E2E");
  await form.getByRole("textbox", { name: "Celular com DDD" }).fill("(11) 99333-2277");
  await form.getByRole("button", { name: "Cadastrar e selecionar" }).click();
  await expect(manual.getByText(/Cliente cadastrado e selecionado/)).toBeVisible();

  await page.goto("/admin/clients");
  await page.getByRole("button", { name: /Sem compras/ }).click();
  const newClient = page.locator('[data-customer-phone="11993332277"]');
  await expect(newClient).toBeVisible();
  await expect(newClient).toContainText("Cliente Central E2E");
  await expect(newClient).toContainText("Sem compras concluídas");
  await expect(newClient).toContainText("0");
  await page.getByRole("textbox", { name: "Buscar clientes" }).fill("993332277");
  await expect(newClient).toBeVisible();
  await newClient.getByRole("button", { name: "Ver histórico" }).click();
  await expect(newClient.getByText("Ainda não há pedidos associados a este telefone.")).toBeVisible();
  await expect(newClient.getByText("Ainda não há movimentações de pontos.")).toBeVisible();

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
});
