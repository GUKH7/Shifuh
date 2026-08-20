import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-owner@shifuh.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Shifuh-E2E-2026!";

test.describe("fluxo comercial completo", () => {
  test.describe.configure({ mode: "serial" });

  test("vitrine cria pedido real e o painel recebe a venda", async ({ page }) => {
    await page.goto("/loja-e2e");

    await expect(page.getByRole("heading", { name: "Loja E2E CI" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Prato E2E CI/ })).toBeVisible();

    await page.getByRole("button", { name: /Prato E2E CI/ }).click();
    await page.getByRole("button", { name: /^Adicionar/ }).click();
    await page.getByRole("button", { name: /Ver pedido|Ver sacola/ }).click();

    await page.getByRole("button", { name: "Escolher recebimento" }).click();
    await page.getByRole("radio", { name: "Retirada" }).check();
    await page.getByLabel("Nome completo").fill("Cliente E2E CI");
    await page.getByLabel("Celular com DDD").fill("11988887777");
    await page.getByRole("button", { name: "Ir para pagamento" }).click();
    await page.getByRole("radio", { name: /Pix/ }).check();

    const orderResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/orders") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Confirmar pedido" }).click();

    const orderResponse = await orderResponsePromise;
    expect(orderResponse.status()).toBe(200);
    const orderPayload = await orderResponse.json();
    expect(orderPayload.orderId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(orderPayload.displayNumber).toMatch(/^\d{4}$/);
    expect(orderPayload.fulfillmentType).toBe("pickup");
    expect(orderPayload.paymentMethod).toBe("pix");
    expect(orderPayload.total).toBe(19.9);

    await expect(page.getByText(`Pedido #${orderPayload.displayNumber}`)).toBeVisible();
    await expect(page.getByText("Retirada na loja", { exact: true }).last()).toBeVisible();

    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Senha").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar agora" }).click();
    await page.waitForURL(/\/admin(?:\/|$)/, { timeout: 20_000 });

    await page.goto("/admin/orders");

    const customer = page.getByText("Cliente E2E CI", { exact: true }).first();
    await expect(customer).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`#${orderPayload.displayNumber}`, { exact: true }).first()).toBeVisible();

    await customer.click();
    await expect(
      page.getByRole("complementary", { name: `Detalhes do pedido ${orderPayload.displayNumber}` }),
    ).toBeVisible();
    await expect(page.getByText("Prato E2E CI", { exact: true }).last()).toBeVisible();
  });
});
