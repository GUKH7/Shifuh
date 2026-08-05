import { expect, test } from "@playwright/test";

const storefrontSlug = process.env.STOREFRONT_VISUAL_SLUG || "villa-costa";

test("vitrine pública mantém estrutura visual em diferentes viewports", async ({
  page,
}, testInfo) => {
  await page.goto(`/${storefrontSlug}`, { waitUntil: "domcontentloaded" });

  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByPlaceholder(/buscar no cardápio/i)).toBeVisible();
  await expect(page.locator("[data-product-card]").first()).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  const unavailableImageContainersAreHidden = await page
    .locator("[data-product-image-unavailable]")
    .evaluateAll((elements) =>
      elements.every((element) => {
        const container = element.parentElement;
        return !container || window.getComputedStyle(container).display === "none";
      }),
    );
  expect(unavailableImageContainersAreHidden).toBe(true);

  await page.screenshot({
    path: testInfo.outputPath(`storefront-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
