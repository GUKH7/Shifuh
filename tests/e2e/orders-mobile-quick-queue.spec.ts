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
    created_at: new Date().toISOString(),
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

    await quickCard.getByRole("button", { name: /Aceitar pedido/ }).click();
    await expect(queue.locator(`[data-quick-order-id="${id}"]`)).toHaveCount(0, { timeout: 12_000 });
    const { data: updated, error: updatedError } = await supabase.from("orders")
      .select("status").eq("id", id).single();
    expect(updatedError).toBeNull();
    expect(updated?.status).toBe("preparing");

    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
  } finally {
    const { error: deleteError } = await supabase.from("orders").delete().eq("id", id);
    expect(deleteError).toBeNull();
  }
});
