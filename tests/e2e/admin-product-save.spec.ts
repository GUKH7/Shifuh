import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-owner@shifuh.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test("membro autenticado consegue editar produto sem falhar no guard de recompensas", async ({ page }) => {
  test.setTimeout(60_000);
  expect(ADMIN_PASSWORD).toBeTruthy();

  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
  await page.getByPlaceholder("seu@email.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD!);

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar agora" }).click();
  expect((await loginResponsePromise).status()).toBe(200);
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 20_000 });

  await page.goto("/admin/menu");
  const editButton = page.getByRole("button", { name: "Editar produto Prato E2E CI" });
  await expect(editButton).toBeVisible({ timeout: 20_000 });
  await editButton.click();

  await expect(page.getByRole("heading", { name: "Editar produto" })).toBeVisible();
  const description = `Produto atualizado no E2E ${Date.now()}`;
  await page.getByPlaceholder("Descrição curta do item").fill(description);

  let unexpectedDialog = "";
  page.once("dialog", async (dialog) => {
    unexpectedDialog = dialog.message();
    await dialog.dismiss();
  });

  await page.getByRole("button", { name: "Salvar produto" }).click();

  await expect(page.getByRole("heading", { name: "Editar produto" })).toBeHidden({ timeout: 20_000 });
  expect(unexpectedDialog).toBe("");
  await expect(page.getByText(description, { exact: true })).toBeVisible({ timeout: 20_000 });
});
