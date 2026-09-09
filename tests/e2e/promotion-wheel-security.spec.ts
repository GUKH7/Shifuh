import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-owner@shifuh.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Shifuh-E2E-2026!";

const DESKTOP_ORDER_ID = "88888888-8888-4888-8888-888888888888";
const MOBILE_ORDER_ID = "99999999-9999-4999-8999-999999999999";
const FOREIGN_ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FOREIGN_SPIN_ID = "12121212-1212-4212-8212-121212121212";

async function loginWithVerifiedPromotionIdentity(page: any) {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
  await page.getByPlaceholder("seu@email.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD);

  const responsePromise = page.waitForResponse(
    (response: any) =>
      response.url().endsWith("/api/admin/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar agora" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await page.waitForURL((url: URL) => url.pathname === "/admin", { timeout: 20_000 });
}

async function postJson(page: any, path: string, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ path: requestPath, body: requestBody }: { path: string; body: Record<string, unknown> }) => {
      const response = await fetch(requestPath, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({}));
      return { status: response.status, payload };
    },
    { path, body },
  );
}

test.describe("segurança e antifraude da Roleta da Sorte", () => {
  test.describe.configure({ mode: "serial" });

  test("orienta visitante após o pedido sem exibir um giro inexistente", async ({ page }) => {
    await page.addInitScript(
      ({ key, orderId }) => {
        window.localStorage.setItem(key, JSON.stringify({ orderId }));
      },
      {
        key: "gestor-delivery:last-order:loja-e2e",
        orderId: DESKTOP_ORDER_ID,
      },
    );

    await page.goto("/loja-e2e");
    await expect(page.getByRole("heading", { name: "Loja E2E CI", level: 1 })).toBeVisible();

    const identityNotice = page.getByRole("status", {
      name: "Ação necessária para participar da Roleta",
    });
    await expect(identityNotice).toBeVisible({ timeout: 15_000 });
    await expect(identityNotice.getByText("Entre para validar sua chance na Roleta")).toBeVisible();
    await expect(page.getByRole("button", { name: /Você ganhou um giro!/ })).toHaveCount(0);

    await identityNotice.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL((url) =>
      url.pathname === "/auth" && url.searchParams.get("returnUrl") === "/loja-e2e",
    );
  });

  test("isola tenants e resolve o giro real pelo servidor", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loginWithVerifiedPromotionIdentity(page);

    const foreignEligibility = await postJson(
      page,
      "/api/storefront/promotions/wheel/eligibility",
      { slug: "loja-estrangeira-e2e", orderId: FOREIGN_ORDER_ID },
    );
    expect(foreignEligibility.status).toBe(403);
    expect(JSON.stringify(foreignEligibility.payload)).not.toContain("Prêmio estrangeiro secreto");

    const foreignSpin = await postJson(page, "/api/storefront/promotions/wheel", {
      spinId: FOREIGN_SPIN_ID,
    });
    expect(foreignSpin.status).toBe(403);
    expect(JSON.stringify(foreignSpin.payload)).not.toContain("Prêmio estrangeiro secreto");

    const orderId = testInfo.project.name === "mobile-chrome"
      ? MOBILE_ORDER_ID
      : DESKTOP_ORDER_ID;

    const eligibility = await postJson(
      page,
      "/api/storefront/promotions/wheel/eligibility",
      { slug: "loja-e2e", orderId },
    );

    expect(eligibility.status).toBe(200);
    expect(eligibility.payload.spin?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(eligibility.payload.spin?.campaignName).toBe("Roleta Segura E2E");
    expect(eligibility.payload.segments).toEqual([
      expect.objectContaining({
        id: "77777777-7777-4777-8777-777777777777",
        label: "R$ 5 de desconto E2E",
        type: "fixed",
      }),
    ]);
    expect(JSON.stringify(eligibility.payload.segments)).not.toContain("probability");
    expect(JSON.stringify(eligibility.payload.segments)).not.toContain("frequency");

    await page.goto("/loja-e2e");
    await expect(page.getByRole("heading", { name: "Loja E2E CI", level: 1 })).toBeVisible();

    const wheelTrigger = page.getByRole("button", { name: /Você ganhou um giro!/ });
    await expect(wheelTrigger).toBeVisible({ timeout: 15_000 });
    await wheelTrigger.click();

    await expect(page.getByText("Roleta da Sorte", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Roleta Segura E2E" })).toBeVisible();

    const resolveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/storefront/promotions/wheel") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Girar agora" }).click();
    const resolveResponse = await resolveResponsePromise;
    expect(resolveResponse.status()).toBe(200);

    const resolvePayload = await resolveResponse.json();
    expect(resolvePayload.result.prizeId).toBe("77777777-7777-4777-8777-777777777777");
    expect(resolvePayload.result.label).toBe("R$ 5 de desconto E2E");
    expect(resolvePayload.result.rewardId).toMatch(/^[0-9a-f-]{36}$/i);

    const result = page.getByRole("status");
    await expect(result).toBeVisible({ timeout: 5_000 });
    await expect(result.getByRole("heading", { name: "R$ 5 de desconto E2E" })).toBeVisible();
    await expect(result.getByText(/já foi registrado na sua conta/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Ver Meus prêmios/ })).toBeVisible();
  });
});
