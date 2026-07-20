import {
  extractMerchantUuidFromIfoodUrl,
  normalizeIfoodAddonGroups,
  type ImportedAddonGroup,
} from "@/lib/ifood/public-page";

type ScrapedMenuSection = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    addons: ImportedAddonGroup[];
  }>;
};

type ScrapedMenuItem = ScrapedMenuSection["items"][number];

type PublicMenuAddressHint = {
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

function normalizeComparableText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

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
    // falls through to local candidates
  }

  const localCandidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ];

  for (const candidate of localCandidates) {
    if ("Bun" in globalThis) continue;

    const fs = await import("node:fs/promises");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep trying
    }
  }

  throw new Error(
    "Nenhum executável do navegador foi encontrado para raspar o cardápio público do iFood.",
  );
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

          const itemId =
            String(itemRecord.id || itemRecord.code || "").trim() ||
            `${title}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

          return {
            id: itemId,
            name,
            description:
              typeof itemRecord.details === "string" && itemRecord.details.trim().length > 0
                ? itemRecord.details.trim()
                : null,
            price: parseMoneyFromText(String(itemRecord.unitPrice ?? itemRecord.price ?? "")),
            imageUrl: logoUrl,
            addons: normalizeIfoodAddonGroups(itemRecord, itemId),
          };
        })
        .filter(Boolean) as ScrapedMenuItem[];

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

function parseCatalogApiResponse(payloadText: string): ScrapedMenuSection[] {
  const trimmedPayload = payloadText.trim();
  if (!trimmedPayload.startsWith("{") && !trimmedPayload.startsWith("[")) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedPayload) as Record<string, any>;
    const menu = parsed?.data?.menu ?? parsed?.menu ?? parsed?.data?.data?.menu ?? [];
    return normalizeStateMenu(menu);
  } catch {
    return [];
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probePublicCatalogEndpoint(merchantUuid: string, sourceUrl: string) {
  const response = await fetch(
    `https://www.ifood.com.br/site-api/v1/merchants/restaurant/${merchantUuid}/catalog`,
    {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        accept: "application/json,text/plain,*/*",
        referer: sourceUrl,
      },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    },
  );

  const bodyText = await response.text();
  const normalizedBody = normalizeComparableText(bodyText);

  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    bodyText,
    isCloudflareBlock:
      response.status === 403 &&
      (normalizedBody.includes("just a moment") || normalizedBody.includes("cloudflare")),
  };
}

function buildAddressSearchQuery(addressHint?: PublicMenuAddressHint | null) {
  if (!addressHint) return null;

  const parts = [
    addressHint.street,
    addressHint.number,
    addressHint.neighborhood,
    addressHint.city,
    addressHint.state,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

async function tryResolveMenuByAddressFlow(
  page: import("puppeteer-core").Page,
  addressHint?: PublicMenuAddressHint | null,
) {
  const hintButton = await page.$("[data-test-id='hint-right-button']");
  const addressQuery = buildAddressSearchQuery(addressHint);

  if (!hintButton || !addressQuery) {
    return false;
  }

  await hintButton.evaluate((node) => (node as HTMLElement).click());
  await delay(700);

  const searchTrigger =
    (await page.$(".address-search-input__button")) ||
    (await page.$(".address-search-input--role-button button")) ||
    (await page.$(".address-search-input--role-button"));

  if (!searchTrigger) {
    return false;
  }

  await searchTrigger.evaluate((node) => (node as HTMLElement).click());
  await delay(600);

  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("input.address-search-input__field")).some(
        (input) => !input.hasAttribute("disabled"),
      ),
    { timeout: 4000 },
  );

  const searchField = await page.evaluateHandle(() => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("input.address-search-input__field"),
    );
    return inputs.find((input) => !input.hasAttribute("disabled")) ?? null;
  });

  const searchFieldElement = searchField.asElement();
  if (!searchFieldElement) {
    return false;
  }

  const searchInput = searchFieldElement as unknown as {
    evaluate: (pageFunction: (node: Element) => void) => Promise<void>;
    click: () => Promise<void>;
    type: (text: string, options?: { delay?: number }) => Promise<void>;
  };

  await searchInput.evaluate((node) => (node as HTMLInputElement).select()).catch(() => null);
  await searchInput.click().catch(() => null);
  await searchInput.type(addressQuery, { delay: 40 });

  await page.waitForSelector("li[data-test-id^='button-address-'] .btn-address--full-size", {
    timeout: 5000,
  });

  const addressOptions = await page.$$(
    "li[data-test-id^='button-address-'] .btn-address--full-size",
  );
  if (addressOptions.length === 0) {
    return false;
  }

  await addressOptions[0].evaluate((node) => (node as HTMLElement).click());
  await delay(700);

  const numberFieldSelector = "input.form-input__field";
  await page.waitForSelector(numberFieldSelector, { timeout: 4000 }).catch(() => null);

  const numberFields = await page.$$(numberFieldSelector);
  if (numberFields.length > 0 && addressHint?.number?.trim()) {
    await numberFields[0].evaluate((node) => (node as HTMLInputElement).select()).catch(() => null);
    await numberFields[0].click().catch(() => null);
    await numberFields[0].type(addressHint.number.trim(), { delay: 30 }).catch(() => null);
  }

  const mapConfirmButton = await page.$(".address-maps__submit");
  if (mapConfirmButton) {
    await mapConfirmButton.evaluate((node) => (node as HTMLElement).click());
    await delay(800);
  }

  const saveAddressButton = await page.evaluateHandle(() => {
    return (
      Array.from(document.querySelectorAll("button")).find((button) =>
        normalizeComparableText(button.textContent).includes("salvar endereco"),
      ) ?? null
    );
  });

  const saveAddressElement = saveAddressButton.asElement();
  if (saveAddressElement) {
    await saveAddressElement.evaluate((node) => (node as HTMLElement).click()).catch(() => null);
  }

  await delay(3000);
  return true;
}

export async function scrapeIfoodPublicMenu(
  sourceUrl: string,
  addressHint?: PublicMenuAddressHint | null,
) {
  const merchantUuid = extractMerchantUuidFromIfoodUrl(sourceUrl);
  let publicCatalogProbe: Awaited<ReturnType<typeof probePublicCatalogEndpoint>> | null = null;

  if (merchantUuid) {
    try {
      publicCatalogProbe = await probePublicCatalogEndpoint(merchantUuid, sourceUrl);
      if (publicCatalogProbe.status === 200) {
        const directMenu = parseCatalogApiResponse(publicCatalogProbe.bodyText);
        if (directMenu.length > 0) return directMenu;
      }
    } catch (error) {
      console.warn("Leitura direta do catálogo público do iFood falhou:", error);
    }
  }

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
    defaultViewport: null,
    executablePath,
    headless: headlessMode,
  });

  try {
    const page = await browser.newPage();
    const cdp = await page.target().createCDPSession();
    await cdp.send("Network.enable");

    let resolveCatalogPayload: (payload: string | null) => void = () => {};
    const catalogPayloadPromise = new Promise<string | null>((resolve) => {
      resolveCatalogPayload = resolve;
    });
    let catalogPayloadSettled = false;

    cdp.on("Network.responseReceived", async (event) => {
      if (catalogPayloadSettled) return;

      if (
        event.response.status !== 200 ||
        !event.response.url.includes("/site-api/v1/merchants/restaurant/") ||
        !event.response.url.includes("/catalog")
      ) {
        return;
      }

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const body = await cdp.send("Network.getResponseBody", {
            requestId: event.requestId,
          });
          catalogPayloadSettled = true;
          resolveCatalogPayload(
            body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf-8") : body.body,
          );
          return;
        } catch {
          await delay(250);
        }
      }
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1440, height: 1800, deviceScaleFactor: 1 });
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);

    const hadAddressPrompt = await page
      .evaluate(() => {
        const normalizedBodyText = normalizeComparableText(document.body.innerText);
        return Boolean(
          document.querySelector("[data-test-id='hint-right-button']") &&
            normalizedBodyText.includes("informe seu endereco"),
        );
      })
      .catch(() => false);

    if (hadAddressPrompt) {
      await tryResolveMenuByAddressFlow(page, addressHint).catch(() => null);
    }

    const catalogPayload = await Promise.race<string | null>([
      catalogPayloadPromise,
      delay(6000).then(() => null),
    ]);

    if (catalogPayload) {
      const parsedCatalogMenu = parseCatalogApiResponse(catalogPayload);
      if (parsedCatalogMenu.length > 0) {
        return parsedCatalogMenu;
      }
    }

    await page
      .waitForFunction(
        () => {
          const state = (window as any).__NEXT_REDUX_STORE__?.getState?.();
          const stateMenu = state?.restaurant?.menu;

          if (Array.isArray(stateMenu) && stateMenu.length > 0) {
            return true;
          }

          return Boolean(
            document.querySelector(
              [
                ".restaurant-menu-group__title",
                ".dish-card__description",
                ".product-card__description",
              ].join(", "),
            ),
          );
        },
        { timeout: 6000 },
      )
      .catch(() => null);

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

      const sections = Array.from(document.querySelectorAll<HTMLElement>(".restaurant-menu-group"));

      return sections
        .map((section, sectionIndex) => {
          const title =
            normalize(section.querySelector<HTMLElement>(".restaurant-menu-group__title")?.textContent) ||
            normalize(section.getAttribute("data-test-id")) ||
            `Categoria ${sectionIndex + 1}`;

          const cards = Array.from(
            section.querySelectorAll<HTMLElement>(
              ["a.dish-card", "[data-test-id='dish-card-test-id']", ".product-card-content"].join(", "),
            ),
          );

          const items = cards
            .map((card, itemIndex) => {
              const name = normalize(
                card.querySelector<HTMLElement>(".dish-card__description, .product-card__description")?.textContent,
              );

              if (!name) return null;

              const details = normalize(
                card.querySelector<HTMLElement>(".dish-card__details, .product-card__details")?.textContent,
              );

              const priceText = normalize(
                card.querySelector<HTMLElement>(".dish-card__price, .product-card__price")?.textContent,
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

    const normalizedMenuSections = menuSections.map((section: any) => ({
      id: section.id,
      name: section.name,
      items: (section.items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: parseMoneyFromText(item.priceText),
        imageUrl: item.imageUrl,
        addons: [],
      })),
    })) as ScrapedMenuSection[];

    if (normalizedMenuSections.length > 0) {
      return normalizedMenuSections;
    }

    if (hadAddressPrompt) {
      throw new Error(
        "O iFood exigiu um contexto de endereço e o cardápio não apareceu mesmo após tentar preencher um endereço público da própria loja.",
      );
    }

    if (publicCatalogProbe?.isCloudflareBlock) {
      throw new Error(
        "O iFood bloqueou o acesso automatizado ao catálogo público por proteção anti-bot (Cloudflare). Nesse ambiente do servidor, o cardápio não pode ser copiado apenas pelo link.",
      );
    }

    if (
      publicCatalogProbe &&
      publicCatalogProbe.status >= 400 &&
      publicCatalogProbe.contentType.includes("text/html")
    ) {
      throw new Error(
        `O endpoint público do catálogo respondeu ${publicCatalogProbe.status} com HTML em vez de JSON. O iFood não liberou o cardápio público para leitura automatizada nessa sessão.`,
      );
    }

    throw new Error("O cardápio público do iFood não ficou disponível nessa sessão de navegação.");
  } finally {
    await browser.close();
  }
}
