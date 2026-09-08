import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-owner@shifuh.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Shifuh-E2E-2026!";

test.describe("fluxo comercial completo", () => {
  test.describe.configure({ mode: "serial" });

  test("vitrine cria pedido real, painel recebe a venda e fidelidade pontua uma única vez", async ({ page }) => {
    await page.goto("/loja-e2e");

    await expect(page.getByRole("heading", { name: "Loja E2E CI", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Prato E2E CI/ })).toBeVisible();

    await page.getByRole("button", { name: /Prato E2E CI/ }).click();
    await page.getByRole("button", { name: /^Adicionar R\$/ }).click();
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
    await expect(page.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
    await page.getByPlaceholder("seu@email.com").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD);

    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Entrar agora" }).click();

    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    await page.waitForURL((url) => url.pathname === "/admin", { timeout: 20_000 });

    await page.goto("/admin/promotions/loyalty");
    await expect(page.getByRole("heading", { name: "Programa de fidelidade" })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Status").selectOption("active");
    await page.getByLabel("Forma de acúmulo").selectOption("spend");
    await page.getByLabel("A cada valor gasto").fill("1,00");
    await page.getByLabel("Pontos concedidos").fill("1");
    await page.getByLabel("Pedido mínimo para pontuar").fill("0,00");
    await page.getByRole("button", { name: "Salvar configuração" }).click();
    await expect(page.getByRole("status")).toContainText("Configuração do programa salva com sucesso.");

    await page.goto("/admin/orders");
    await page.waitForURL((url) => url.pathname === "/admin/orders", { timeout: 20_000 });

    const customer = page.getByText("Cliente E2E CI", { exact: true }).first();
    await expect(customer).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`#${orderPayload.displayNumber}`, { exact: true }).first()).toBeVisible();

    await customer.click();
    await expect(
      page.getByRole("complementary", { name: `Detalhes do pedido ${orderPayload.displayNumber}` }),
    ).toBeVisible();
    await expect(page.getByText("Prato E2E CI", { exact: true }).last()).toBeVisible();

    const completeOrder = () =>
      page.request.patch(`/api/orders/${orderPayload.orderId}/status`, {
        data: {
          status: "done",
          notifyCustomer: false,
        },
      });

    const firstCompletion = await completeOrder();
    expect(firstCompletion.status()).toBe(200);
    expect((await firstCompletion.json()).order.status).toBe("done");

    const retryCompletion = await completeOrder();
    expect(retryCompletion.status()).toBe(200);
    expect((await retryCompletion.json()).order.status).toBe("done");

    await page.goto("/admin/promotions/loyalty");
    await expect(page.getByRole("heading", { name: "Saldo por cliente" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("(11) 98888-7777", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("19 pts", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("+19 pts", { exact: true })).toHaveCount(1);
    await expect(page.getByText(`Pontos do pedido #${orderPayload.displayNumber}`, { exact: true })).toBeVisible();
  });
});
