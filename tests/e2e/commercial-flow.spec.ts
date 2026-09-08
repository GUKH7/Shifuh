import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-owner@shifuh.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Shifuh-E2E-2026!";

test.describe("fluxo comercial completo", () => {
  test.describe.configure({ mode: "serial" });

  test("vitrine cria pedido real, fidelidade pontua uma única vez e catálogo persiste recompensa", async ({ page }) => {
    test.setTimeout(60_000);

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
    await page.getByLabel("Status").first().selectOption("active");
    await page.getByLabel("Forma de acúmulo").selectOption("spend");
    await page.getByLabel("A cada valor gasto").fill("1,00");
    await page.getByLabel("Pontos concedidos").fill("1");
    await page.getByLabel("Pedido mínimo para pontuar").fill("0,00");
    await page.getByRole("button", { name: "Salvar configuração" }).click();
    await expect(page.getByRole("status")).toContainText("Configuração do programa salva com sucesso.");

    // The catalog is a sibling workspace, so reload after first-time program creation to hydrate it
    // from the persisted program. Existing programs load both workspaces together on first render.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Catálogo de recompensas" })).toBeVisible({ timeout: 20_000 });

    const rewardName = `Recompensa E2E ${Date.now()}`;
    await page.getByLabel("Nome da recompensa").fill(rewardName);
    await page.getByLabel("Tipo de benefício").selectOption("fixed");
    await page.getByLabel("Custo em pontos").fill("50");
    await page.getByLabel("Valor do desconto (R$)").fill("5,00");
    await page.getByLabel("Pedido mínimo (R$)").fill("10,00");
    await page.getByLabel("Validade após resgate (dias)").fill("15");
    await page.getByLabel("Limite total de resgates").fill("25");
    await page.getByRole("button", { name: "Adicionar recompensa" }).click();
    await expect(page.getByRole("status")).toContainText("Recompensa adicionada ao catálogo.");

    const rewardHeading = page.getByRole("heading", { name: rewardName, exact: true });
    await expect(rewardHeading).toBeVisible();
    const rewardCard = rewardHeading.locator("xpath=ancestor::article");
    await expect(rewardCard.getByText(/R\$\s*5,00 OFF · 50 pts/)).toBeVisible();
    await expect(rewardCard.getByText(/pedido mínimo R\$\s*10,00/)).toBeVisible();
    await expect(rewardCard.getByText(/15 dias de validade/)).toBeVisible();
    await expect(rewardCard.getByText(/Limite total: 25 resgates/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: rewardName, exact: true })).toBeVisible({ timeout: 20_000 });

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

    const transactionDescription = `Pontos do pedido #${orderPayload.displayNumber}`;
    const transactionDescriptionLocator = page.getByText(transactionDescription, { exact: true });
    await expect(transactionDescriptionLocator).toHaveCount(1);

    const transactionRow = transactionDescriptionLocator.locator("xpath=ancestor::article");
    await expect(transactionRow).toBeVisible();
    await expect(transactionRow.getByText("+19 pts", { exact: true })).toBeVisible();
  });
});
