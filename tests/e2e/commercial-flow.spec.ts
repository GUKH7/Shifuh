import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-owner@shifuh.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

async function browserJson(
  page: Page,
  path: string,
  options: { method?: string; body?: Record<string, unknown>; idempotencyKey?: string } = {},
) {
  return page.evaluate(
    async ({ requestPath, method, body, idempotencyKey }) => {
      const response = await fetch(requestPath, {
        method,
        credentials: "same-origin",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      return { status: response.status, payload };
    },
    {
      requestPath: path,
      method: options.method || "GET",
      body: options.body,
      idempotencyKey: options.idempotencyKey,
    },
  );
}

test.describe("fluxo comercial completo", () => {
  test.describe.configure({ mode: "serial" });

  test("pedido pontua uma vez, recompensa é resgatada uma vez e benefício é consumido no checkout", async ({ page }) => {
    test.setTimeout(90_000);
    expect(ADMIN_PASSWORD).toBeTruthy();

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
    await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD!);

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

    await page.reload();
    await expect(page.getByRole("heading", { name: "Catálogo de recompensas" })).toBeVisible({ timeout: 20_000 });

    const rewardName = `Recompensa E2E ${Date.now()}`;
    await page.getByLabel("Nome da recompensa").fill(rewardName);
    await page.getByLabel("Tipo de benefício").selectOption("fixed");
    await page.getByLabel("Custo em pontos").fill("10");
    await page.getByLabel("Valor do desconto (R$)").fill("5,00");
    await page.getByLabel("Pedido mínimo (R$)").fill("10,00");
    await page.getByLabel("Validade após resgate (dias)").fill("15");
    await page.getByLabel("Limite total de resgates").fill("25");
    await page.getByRole("button", { name: "Adicionar recompensa" }).click();
    await expect(page.getByRole("status")).toContainText("Recompensa adicionada ao catálogo.");

    const rewardHeading = page.getByRole("heading", { name: rewardName, exact: true });
    await expect(rewardHeading).toBeVisible();
    const rewardCard = rewardHeading.locator("xpath=ancestor::article");
    await expect(rewardCard.getByText(/R\$\s*5,00 OFF · 10 pts/)).toBeVisible();
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

    const loyaltyState = await browserJson(
      page,
      `/api/customer/loyalty?restaurantId=${RESTAURANT_ID}`,
    );
    expect(loyaltyState.status).toBe(200);
    expect(loyaltyState.payload.programs).toHaveLength(1);
    expect(loyaltyState.payload.programs[0].account.balance).toBe(19);
    const catalogReward = loyaltyState.payload.programs[0].rewards.find(
      (reward: any) => reward.name === rewardName,
    );
    expect(catalogReward).toEqual(expect.objectContaining({
      pointsCost: 10,
      fixedAmount: 5,
      canRedeem: true,
    }));

    const redemptionKey = crypto.randomUUID();
    const firstRedemption = await browserJson(page, "/api/customer/loyalty/redeem", {
      method: "POST",
      idempotencyKey: redemptionKey,
      body: { rewardId: catalogReward.id },
    });
    expect(firstRedemption.status).toBe(200);
    expect(firstRedemption.payload.redemption).toEqual(expect.objectContaining({
      source: "loyalty",
      rewardId: catalogReward.id,
      label: rewardName,
      pointsSpent: 10,
      balanceAfter: 9,
    }));
    expect(firstRedemption.payload.redemption.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(firstRedemption.payload.redemption.benefitId).toMatch(/^[0-9a-f-]{36}$/i);

    const retryRedemption = await browserJson(page, "/api/customer/loyalty/redeem", {
      method: "POST",
      idempotencyKey: redemptionKey,
      body: { rewardId: catalogReward.id },
    });
    expect(retryRedemption.status).toBe(200);
    expect(retryRedemption.payload.redemption.id).toBe(firstRedemption.payload.redemption.id);
    expect(retryRedemption.payload.redemption.benefitId).toBe(firstRedemption.payload.redemption.benefitId);
    expect(retryRedemption.payload.redemption.balanceAfter).toBe(9);

    const benefitsBeforeCheckout = await browserJson(page, "/api/customer/rewards");
    expect(benefitsBeforeCheckout.status).toBe(200);
    const loyaltyBenefit = benefitsBeforeCheckout.payload.rewards.find(
      (reward: any) => reward.id === firstRedemption.payload.redemption.benefitId,
    );
    expect(loyaltyBenefit).toEqual(expect.objectContaining({
      source: "loyalty",
      label: rewardName,
      status: "available",
      pointsSpent: 10,
      balanceAfter: 9,
    }));

    const loyaltyOrderKey = crypto.randomUUID();
    const loyaltyOrderBody = {
      restaurantId: RESTAURANT_ID,
      customerName: "Cliente E2E CI",
      customerPhone: "11988887777",
      address: {},
      fulfillmentType: "pickup",
      paymentMethod: "pix",
      changeFor: "",
      couponCode: null,
      rewardId: loyaltyBenefit.id,
      usingSavedAddress: false,
      saveAddress: false,
      scheduledFor: null,
      cart: [{ productId: PRODUCT_ID, quantity: 1, selectedAddons: [], observation: "" }],
    };

    const loyaltyOrder = await browserJson(page, "/api/orders", {
      method: "POST",
      idempotencyKey: loyaltyOrderKey,
      body: loyaltyOrderBody,
    });
    expect(loyaltyOrder.status).toBe(200);
    expect(loyaltyOrder.payload.discount).toBe(5);
    expect(loyaltyOrder.payload.total).toBe(14.9);
    expect(loyaltyOrder.payload.reward).toEqual(expect.objectContaining({
      id: loyaltyBenefit.id,
      type: "fixed",
      label: rewardName,
    }));

    const retryLoyaltyOrder = await browserJson(page, "/api/orders", {
      method: "POST",
      idempotencyKey: loyaltyOrderKey,
      body: loyaltyOrderBody,
    });
    expect(retryLoyaltyOrder.status).toBe(200);
    expect(retryLoyaltyOrder.payload.orderId).toBe(loyaltyOrder.payload.orderId);
    expect(retryLoyaltyOrder.payload.total).toBe(14.9);

    const benefitsAfterCheckout = await browserJson(page, "/api/customer/rewards");
    expect(benefitsAfterCheckout.status).toBe(200);
    expect(
      benefitsAfterCheckout.payload.rewards.find((reward: any) => reward.id === loyaltyBenefit.id),
    ).toEqual(expect.objectContaining({
      source: "loyalty",
      status: "redeemed",
      redeemedOrderId: loyaltyOrder.payload.orderId,
    }));

    const loyaltyAfterRedemption = await browserJson(
      page,
      `/api/customer/loyalty?restaurantId=${RESTAURANT_ID}`,
    );
    expect(loyaltyAfterRedemption.status).toBe(200);
    expect(loyaltyAfterRedemption.payload.programs[0].account.balance).toBe(9);
    expect(loyaltyAfterRedemption.payload.programs[0].account.lifetimeRedeemed).toBe(10);

    await page.goto("/admin/promotions/loyalty");
    await expect(page.getByText(`Resgate: ${rewardName}`, { exact: true })).toHaveCount(1);
  });
});
