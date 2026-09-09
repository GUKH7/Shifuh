import { expect, test } from "@playwright/test";

test("vitrine divulga Fidelidade e Roleta ativas na mesma área promocional", async ({ page }) => {
  await page.goto("/loja-e2e");
  await expect(page.getByRole("heading", { name: "Loja E2E CI", level: 1 })).toBeVisible();

  const promotions = page.getByRole("region", { name: "Promoções da loja" });
  await expect(promotions).toBeVisible({ timeout: 15_000 });
  await expect(
    promotions.getByText("Ganhe 1 ponto a cada R$ 1 gasto.", { exact: true }),
  ).toBeVisible();
  await expect(
    promotions.getByText("Acumule pontos nesta loja e troque por recompensas.", { exact: true }),
  ).toBeVisible();
  await expect(
    promotions.getByText("Faça um pedido e ganhe uma chance de girar.", { exact: true }),
  ).toBeVisible();
  await expect(promotions.getByText("Roleta Segura E2E", { exact: true })).toBeVisible();
});
