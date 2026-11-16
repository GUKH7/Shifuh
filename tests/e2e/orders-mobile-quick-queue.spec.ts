import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";
const SEEDED_ORDER_ID = "88888888-8888-4888-8888-888888888888";

test("mobile: fila rápida abre detalhes e aceita pedido com Supabase isolado", async ({ page }) => {
  test.setTimeout(75_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  // This test must never write to a remote/production database.
  test.skip(!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?/.test(url), "Somente Supabase local");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(serviceKey).toBeTruthy();
  const supabase = createClient(url, serviceKey!, { auth: { persistSession: false } });
  const { data: seed, error: seedError } = await supabase.from("orders")
    .select("user_id").eq("id", SEEDED_ORDER_ID).single();
  expect(seedError).toBeNull();
  expect(seed?.user_id).toBeTruthy();

  const id = randomUUID();
  const { error: insertError } = await supabase.from("orders").insert({
    id, restaurant_id: RESTAURANT_ID, user_id: seed!.user_id,
    customer_name: "Cliente Fila Rápida E2E", customer_phone: "11981112233",
    subtotal: 23.5, delivery_fee: 0, discount: 0, total: 23.5,
    status: "pending", payment_method: "pix", is_test: true,
    // A previously created pending order may survive commercial E2E; use a
    // due scheduled fixture from an earlier day so this is deterministically oldest.
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    scheduled_for: new Date().toISOString(),
  });
  expect(insertError).toBeNull();

  try {
    await page.goto("/admin/login");
    await page.getByPlaceholder("seu@email.com").fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByPlaceholder("••••••••").fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Entrar agora" }).click();
    await page.waitForURL((loc) => loc.pathname === "/admin", { timeout: 20_000 });

    await page.goto("/admin/orders");
    const queue = page.getByRole("region", { name: "Atendimento rápido" });
    await expect(queue).toBeVisible({ timeout: 20_000 });
    const quickCard = queue.getByTestId("orders-next-pending");
    await expect(quickCard).toHaveAttribute("data-quick-order-id", id);
    await expect(quickCard).toContainText("Cliente Fila Rápida E2E");

    // Opening a quick order must clear search filters that would hide the row.
    await page.getByPlaceholder(/Buscar por cliente/).fill("pedido inexistente");
    await quickCard.getByRole("button", { name: /Ver detalhes do pedido/ }).click();
    const details = page.getByRole("complementary", { name: /Detalhes do pedido/ });
    await expect(details).toBeVisible();
    await details.getByRole("button", { name: "Fechar detalhes do pedido" }).click();

    const statusUrl = `/api/orders/${id}/status`;
    // A failed PATCH must NOT make a pending order disappear from the queue.
    let rejectFirstAttempt = true;
    await page.route(`**${statusUrl}`, async (route) => {
      if (rejectFirstAttempt) {
        rejectFirstAttempt = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Falha simulada no aceite" }),
        });
        return;
      }
      await route.continue();
    });

    const failedResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(statusUrl) && response.request().method() === "PATCH",
    );
    await quickCard.getByRole("button", { name: /Aceitar pedido/ }).click();
    expect((await failedResponsePromise).status()).toBe(503);
    await expect(quickCard).toHaveAttribute("data-quick-order-id", id);
    await expect(quickCard.getByRole("button", { name: /Aceitar pedido/ })).toBeEnabled();
    const { data: pending } = await supabase.from("orders")
      .select("status").eq("id", id).single();
    expect(pending?.status).toBe("pending");

    // After the real API confirms the update, the order can leave the queue.
    const acceptedResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(statusUrl) && response.request().method() === "PATCH",
    );
    await quickCard.getByRole("button", { name: /Aceitar pedido/ }).click();
    const acceptedResponse = await acceptedResponsePromise;
    expect(acceptedResponse.status()).toBe(200);
    const acceptedPayload = await acceptedResponse.json();
    expect(acceptedPayload.order?.status).toBe("preparing");
    await expect(queue.locator(`[data-quick-order-id="${id}"]`)).toHaveCount(0, { timeout: 12_000 });
    await expect.poll(async () => {
      const { data, error } = await supabase.from("orders").select("status").eq("id", id).single();
      expect(error).toBeNull();
      return data?.status;
    }, { timeout: 12_000 }).toBe("preparing");

    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
  } finally {
    const { error: deleteError } = await supabase.from("orders").delete().eq("id", id);
    expect(deleteError).toBeNull();
  }
});
