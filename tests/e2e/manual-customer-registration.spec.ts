import { expect, test } from "@playwright/test";

test("cadastro presencial rápido cadastra, reutiliza e seleciona cliente para crédito no celular", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto("/admin/login");
  await page.getByPlaceholder("seu@email.com").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByPlaceholder("••••••••").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL(url => url.pathname === "/admin", { timeout: 20_000 });
  await page.goto("/admin/pontos");
  const section = page.getByRole("region", { name: "Crédito por compra presencial" });
  await expect(section).toBeVisible();

  await section.getByRole("button", { name: /Novo cliente presencial/ }).click();
  const form = section.getByRole("form", { name: "Cadastrar cliente presencial" });
  await form.getByRole("textbox", { name: "Nome" }).fill("Cliente Balcão E2E");
  await form.getByRole("textbox", { name: "Celular com DDD" }).fill("(11) 99123-4567");
  await form.getByRole("button", { name: "Cadastrar e selecionar" }).click();

  await expect(section.getByText("Cliente selecionado")).toBeVisible();
  await expect(section.getByText("Cliente Balcão E2E", { exact: true }).last()).toBeVisible();
  await expect(section.getByText("(11) 99123-4567", { exact: true }).last()).toBeVisible();
  await expect(section.getByText(/Cliente cadastrado e selecionado/)).toBeVisible();
  // A registration must NOT automatically credit any points.
  await expect(section.getByText("Saldo atual")).toBeVisible();
  await expect(section.getByText("+0 pontos")).toBeVisible();
  await section.getByRole("button", { name: "Pontos diretos" }).click();
  await section.getByRole("textbox", { name: "Quantidade de pontos" }).fill("2");
  await section.getByRole("button", { name: "Revisar crédito" }).click();
  await expect(section.getByRole("button", { name: "Confirmar crédito" })).toBeEnabled();
  await section.getByRole("button", { name: "Confirmar crédito" }).click();
  await expect(section.getByText("Crédito confirmado e registrado no extrato.")).toBeVisible({timeout: 15_000});

  // Reusing the phone must select the original customer, not create a duplicate.
  await section.getByRole("button", { name: /Novo cliente presencial/ }).click();
  const existingForm = section.getByRole("form", { name: "Cadastrar cliente presencial" });
  await existingForm.getByRole("textbox", { name: "Nome" }).fill("Outro nome E2E");
  await existingForm.getByRole("textbox", { name: "Celular com DDD" }).fill("+55 11 99123-4567");
  await existingForm.getByRole("button", { name: "Cadastrar e selecionar" }).click();
  await expect(section.getByText(/Cliente existente selecionado/)).toBeVisible();
  await expect(section.getByText("Cliente Balcão E2E", { exact: true }).last()).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
});
