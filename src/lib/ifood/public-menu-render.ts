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

  const directNumber = Number(value);
  if (Number.isFinite(directNumber)) {
    return Math.round(directNumber * 100) / 100;
  }

  const match = value.replace(/\s+/g, " ").match(/R\$\s*([\d.,]+)/i);
  if (!match) return 0;

  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

async function resolveExecutablePath(chromium: typeof import("@sparticuz/chromium").default) {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  try {
    const chromiumPath = await chromium.executablePath();
    if (chromiumPath) {
      return chromiumPath;
    }
  } catch {
    // Fallbacks locais ficam abaixo.
  }

  const localCandidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ];

  for (const candidate of localCandidates) {
    if (typeof Bun !== "undefined") continue;

    const fs = await import("node:fs/promises");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Tenta o próximo caminho.
    }
  }

  throw new Error("Nenhum executável do navegador foi encontrado para raspar o cardápio público do iFood.");
}

function normalizeStateMenu(menu: unknown): ScrapedMenuSection[] {
  if (!Array.isArray(menu)) return [];

  return menu
    .map((section, sectionIndex) => {
      if (!section || typeof section !== "object") return null;

      const record = section as Record<string, any>;
      const title = String(record.name || `Categoria ${sectionIndex + 1}`).trim();
      const rawItems = Array.isArray(record.itens)
        ? record.itens
        : Array.isArray(record.items)
          ? record.items
          : [];

      const items = rawItems
        .map((item) => {
          if (!item || typeof item !== "object") return null;

          const itemRecord = item as Record<string, any>;
          const name = String(itemRecord.description || itemRecord.name || "").trim();
          if (!name) return null;

          const logoUrl =
            typeof itemRecord.logoUrl === "string" && itemRecord.logoUrl.trim().length > 0
              ? itemRecord.logoUrl.startsWith("http")
                ? itemRecord.logoUrl
                : `https://static.ifood-static.com.br/image/upload/t_high/pratos/${itemRecord.logoUrl}`
              : null;

          return {
            id:
              String(itemRecord.id || itemRecord.code || "").trim() ||
              `${title}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name,
            description:
              typeof itemRecord.details === "string" && itemRecord.details.trim().length > 0
                ? itemRecord.details.trim()
                : null,
            price: parseMoneyFromText(String(itemRecord.unitPrice ?? itemRecord.price ?? "")),
            imageUrl: logoUrl,
          };
        })
        .filter(Boolean) as ScrapedMenuSection[number]["items"];

      if (items.length === 0) return null;

      return {
        id:
          String(record.code || record.id || "").trim() ||
          `${title}-${sectionIndex + 1}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: title,
        items,
      };
    })
    .filter(Boolean) as ScrapedMenuSection[];
}

export async function scrapeIfoodPublicMenu(sourceUrl: string) {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const executablePath = await resolveExecutablePath(chromium);
  const isLocalWindows = process.platform === "win32";
  const launchArgs = isLocalWindows
    ? ["--no-sandbox", "--disable-setuid-sandbox"]
    : await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" });
  const headlessMode = isLocalWindows ? true : ("shell" as const);

  const browser = await puppeteer.launch({
    args: launchArgs,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: headlessMode,
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

    const stateMenu = await page.evaluate(() => {
      const state = (window as any).__NEXT_REDUX_STORE__?.getState?.();
      return state?.restaurant?.menu ?? [];
    });

    const normalizedStateMenu = normalizeStateMenu(stateMenu);
    if (normalizedStateMenu.length > 0) {
      return normalizedStateMenu;
    }

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
            section.querySelectorAll<HTMLElement>(
              [
                "a.dish-card",
                "[data-test-id='dish-card-test-id']",
                ".product-card-content",
              ].join(", "),
            ),
          );

          const items = cards
            .map((card, itemIndex) => {
              const name = normalize(
                card.querySelector<HTMLElement>(
                  ".dish-card__description, .product-card__description",
                )?.textContent,
              );

              if (!name) return null;

              const details = normalize(
                card.querySelector<HTMLElement>(
                  ".dish-card__details, .product-card__details",
                )?.textContent,
              );

              const priceText = normalize(
                card.querySelector<HTMLElement>(
                  ".dish-card__price, .product-card__price",
                )?.textContent,
              );

              const imageUrl =
                card.querySelector<HTMLImageElement>(
                  ".dish-card__image, .product-card-image__content, .dish-card__container-image img",
                )?.getAttribute("src") || null;

              const href = card.getAttribute("href") || "";
              const urlMatch = href.match(/[?&]prato=([0-9a-f-]+)/i);
              const itemId = urlMatch?.[1] || `${slugify(title)}-${slugify(name)}-${itemIndex + 1}`;

              return {
                id: itemId,
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
