type ScrapedMenuSection = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
  }>;
};

function parseMoneyFromText(value: string | null | undefined) {
  if (!value) return 0;

  const match = value.replace(/\s+/g, " ").match(/R\$\s*([\d.,]+)/i);
  if (!match) return 0;

  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function scrapeIfoodPublicMenu(sourceUrl: string) {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath());

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1440, height: 1800, deviceScaleFactor: 1 });
    await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 45000 });
    await page.waitForSelector(
      ".restaurant-menu-group__title, .product-card__description",
      { timeout: 20000 },
    );

    const menuSections = await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => {
        const trimmed = value?.trim() || "";
        return trimmed.length > 0 ? trimmed : null;
      };

      const slugify = (value: string) =>
        value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

      const sections = Array.from(
        document.querySelectorAll<HTMLElement>(".restaurant-menu-group"),
      );

      return sections
        .map((section, sectionIndex) => {
          const title =
            normalize(section.querySelector<HTMLElement>(".restaurant-menu-group__title")?.textContent) ||
            normalize(section.getAttribute("data-test-id")) ||
            `Categoria ${sectionIndex + 1}`;

          const cards = Array.from(
            section.querySelectorAll<HTMLElement>(".product-card-content"),
          );

          const items = cards
            .map((card, itemIndex) => {
              const name = normalize(
                card.querySelector<HTMLElement>(".product-card__description")?.textContent,
              );

              if (!name) return null;

              const details = normalize(
                card.querySelector<HTMLElement>(".product-card__details")?.textContent,
              );

              const priceText = normalize(
                card.querySelector<HTMLElement>(".product-card__price")?.textContent,
              );

              const imageUrl =
                card.querySelector<HTMLImageElement>(".product-card-image__content")?.getAttribute(
                  "src",
                ) || null;

              return {
                id: `${slugify(title)}-${slugify(name)}-${itemIndex + 1}`,
                name,
                description: details,
                priceText,
                imageUrl,
              };
            })
            .filter(Boolean);

          return {
            id: `${slugify(title)}-${sectionIndex + 1}`,
            name: title,
            items,
          };
        })
        .filter((section) => section.items.length > 0);
    });

    return menuSections.map((section: any) => ({
      id: section.id,
      name: section.name,
      items: (section.items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: parseMoneyFromText(item.priceText),
        imageUrl: item.imageUrl,
      })),
    })) as ScrapedMenuSection[];
  } finally {
    await browser.close();
  }
}
