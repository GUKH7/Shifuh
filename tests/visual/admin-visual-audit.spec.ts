import { expect, test, type Page, type TestInfo } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 900 },
  { name: "desktop-1440", width: 1440, height: 1000 },
] as const;

const ADMIN_PAGES = [
  { name: "dashboard", path: "/admin" },
  { name: "pedidos", path: "/admin/orders" },
  { name: "historico", path: "/admin/history" },
  { name: "cardapios", path: "/admin/menu" },
  { name: "clientes", path: "/admin/customers" },
  { name: "cupons", path: "/admin/coupons" },
  { name: "avaliacoes", path: "/admin/reviews" },
  { name: "configuracoes", path: "/admin/settings" },
] as const;

async function login(page: Page) {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  expect(email, "O secret TEST_ADMIN_EMAIL precisa estar configurado.").toBeTruthy();
  expect(password, "O secret TEST_ADMIN_PASSWORD precisa estar configurado.").toBeTruthy();

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await expect(emailInput, "O campo de e-mail não apareceu na tela de login.").toBeVisible({
    timeout: 10_000,
  });
  await expect(passwordInput, "O campo de senha não apareceu na tela de login.").toBeVisible({
    timeout: 10_000,
  });

  await emailInput.fill(email!);
  await passwordInput.fill(password!);
  await page.getByRole("button", { name: "Entrar agora" }).click();

  await page.waitForURL(
    (url) =>
      url.pathname === "/admin" ||
      (url.pathname.startsWith("/admin/") && url.pathname !== "/admin/login"),
    { timeout: 30_000 },
  );

  expect(page.url()).not.toContain("/admin/login");
}

async function preparePage(page: Page) {
  await page.locator("body").waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.waitForTimeout(1_200);
}

async function capturePage(page: Page, testInfo: TestInfo, pageName: string) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;

    return {
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
      clientWidth: root.clientWidth,
    };
  });

  expect(
    overflow.scrollWidth,
    `${pageName} possui rolagem horizontal: ${overflow.scrollWidth}px para ${overflow.clientWidth}px disponíveis.`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 2);

  await page.screenshot({
    path: testInfo.outputPath(`${pageName}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

test.describe("auditoria visual autenticada do painel ADM", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of VIEWPORTS) {
    test(`captura todas as páginas em ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page);

      for (const adminPage of ADMIN_PAGES) {
        await page.goto(adminPage.path, { waitUntil: "domcontentloaded" });
        await preparePage(page);

        expect(page.url(), `${adminPage.name} redirecionou para o login.`).not.toContain(
          "/admin/login",
        );

        await capturePage(page, testInfo, `${viewport.name}-${adminPage.name}`);
      }
    });
  }
});
