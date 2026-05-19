type JsonRecord = Record<string, unknown>;

export type IfoodPublicStoreData = {
  sourceUrl: string;
  merchantUuid: string;
  slug: string | null;
  shortId: string | null;
  name: string | null;
  description: string | null;
  phone: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  address: {
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
  };
  menuSections: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      price: number;
      imageUrl: string | null;
    }>;
  }>;
};

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function readScriptTag(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] || null;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMoney(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function pickResource(
  resources: unknown,
  acceptedTypes: string[],
  acceptedKinds: string[] = ["COVER", "LOGO"],
) {
  if (!Array.isArray(resources)) return null;

  const match = resources.find((resource) => {
    if (!resource || typeof resource !== "object") return false;
    const record = resource as JsonRecord;
    const type = normalizeText(record.type);
    const kind = normalizeText(record.kind);

    if (type && acceptedTypes.includes(type)) return true;
    if (kind && acceptedKinds.includes(kind) && acceptedTypes.includes(kind)) return true;
    return false;
  }) as JsonRecord | undefined;

  return (
    normalizeText(match?.fileName) ||
    normalizeText(match?.file_url) ||
    normalizeText(match?.fileUrl) ||
    null
  );
}

function findRestaurantState(nextData: JsonRecord | null) {
  const state =
    (nextData?.props as JsonRecord | undefined)?.pageProps &&
    (((nextData.props as JsonRecord).pageProps as JsonRecord).initialState as JsonRecord | undefined);

  return (state?.restaurant as JsonRecord | undefined) || null;
}

function parseJsonLdRestaurant(html: string) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  for (const script of scripts) {
    const parsed = safeJsonParse<JsonRecord>(script[1]);
    if (!parsed) continue;

    if (parsed["@type"] === "Restaurant" || parsed["@type"] === "Store") {
      return parsed;
    }
  }

  return null;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function collectMenuSections(node: unknown, seen = new Set<string>()) {
  const sections: IfoodPublicStoreData["menuSections"] = [];

  function visit(current: unknown) {
    if (!current) return;

    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    if (typeof current !== "object") return;

    const record = current as JsonRecord;
    const sectionName = normalizeText(record.name) || normalizeText(record.title);
    const rawItems = Array.isArray(record.itens)
      ? record.itens
      : Array.isArray(record.items)
        ? record.items
        : null;

    if (sectionName && rawItems?.length) {
      const sectionId =
        normalizeText(record.id) ||
        normalizeText(record.categoryId) ||
        `public-${slugify(sectionName)}`;

      if (!seen.has(sectionId)) {
        const items = rawItems
          .map((item, index) => {
            if (!item || typeof item !== "object") return null;
            const itemRecord = item as JsonRecord;
            const name =
              normalizeText(itemRecord.itemName) ||
              normalizeText(itemRecord.name) ||
              normalizeText(itemRecord.title);

            if (!name) return null;

            const imageUrl =
              normalizeText(itemRecord.logoUrl) ||
              (Array.isArray(itemRecord.logosUrls)
                ? normalizeText(itemRecord.logosUrls[0])
                : null) ||
              normalizeText(itemRecord.imageUrl);

            const rawPrice =
              (itemRecord.itemPrice as JsonRecord | undefined)?.value ??
              itemRecord.price ??
              itemRecord.unitPrice;

            return {
              id:
                normalizeText(itemRecord.itemId) ||
                normalizeText(itemRecord.id) ||
                `${sectionId}-item-${index + 1}`,
              name,
              description:
                normalizeText(itemRecord.itemDescription) ||
                normalizeText(itemRecord.description),
              price: normalizeMoney(rawPrice),
              imageUrl,
            };
          })
          .filter(Boolean) as IfoodPublicStoreData["menuSections"][number]["items"];

        if (items.length > 0) {
          sections.push({
            id: sectionId,
            name: sectionName,
            items,
          });
          seen.add(sectionId);
        }
      }
    }

    Object.values(record).forEach(visit);
  }

  visit(node);
  return sections;
}

export function extractMerchantUuidFromIfoodUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const match = parsed.pathname.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );

  return match?.[1] || null;
}

export function isValidIfoodPublicUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.endsWith("ifood.com.br") && parsed.pathname.includes("/delivery/");
  } catch {
    return false;
  }
}

export function parseIfoodPublicStorePage(html: string, sourceUrl: string) {
  const nextDataScript = readScriptTag(
    html,
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  const nextData = nextDataScript ? safeJsonParse<JsonRecord>(nextDataScript) : null;
  const restaurantState = findRestaurantState(nextData);
  const jsonLd = parseJsonLdRestaurant(html);
  const merchantUuid =
    normalizeText(restaurantState?.uuid) ||
    extractMerchantUuidFromIfoodUrl(sourceUrl);

  if (!merchantUuid) {
    throw new Error("Não foi possível identificar a loja nesse link público do iFood.");
  }

  const stateDetails = restaurantState?.details as JsonRecord | undefined;
  const stateAddress =
    (restaurantState?.address as JsonRecord | undefined) ||
    (jsonLd?.address as JsonRecord | undefined);
  const stateGeo =
    (jsonLd?.geo as JsonRecord | undefined) ||
    (restaurantState?.details as JsonRecord | undefined);

  const menuSections = collectMenuSections(nextData);

  return {
    sourceUrl,
    merchantUuid,
    slug: normalizeText(restaurantState?.slug),
    shortId: normalizeText(restaurantState?.shortId),
    name: normalizeText(restaurantState?.name) || normalizeText(jsonLd?.name),
    description:
      normalizeText(stateDetails?.description) ||
      normalizeText(jsonLd?.description),
    phone:
      normalizeText(stateDetails?.telephone) ||
      normalizeText(jsonLd?.telephone),
    coverUrl: pickResource(restaurantState?.resources, ["COVER"]),
    logoUrl: pickResource(restaurantState?.resources, ["LOGO"]),
    address: {
      street: normalizeText(stateAddress?.streetAddress),
      number: normalizeText(stateAddress?.streetNumber),
      neighborhood: normalizeText(stateAddress?.addressLocality2),
      city:
        normalizeText(stateAddress?.addressLocality) ||
        normalizeText(stateAddress?.city),
      state:
        normalizeText(stateAddress?.addressRegion) ||
        normalizeText(stateAddress?.state),
      zip:
        normalizeText(stateAddress?.postalCode) ||
        normalizeText(stateAddress?.zipCode),
    },
    location: {
      latitude:
        normalizeNumber(stateGeo?.latitude) ||
        normalizeNumber(stateGeo?.lat),
      longitude:
        normalizeNumber(stateGeo?.longitude) ||
        normalizeNumber(stateGeo?.lon),
    },
    menuSections,
  } satisfies IfoodPublicStoreData;
}

export async function fetchIfoodPublicStoreData(sourceUrl: string) {
  if (!isValidIfoodPublicUrl(sourceUrl)) {
    throw new Error("Cole um link público válido do iFood para importar a loja.");
  }

  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Não foi possível abrir a página pública do iFood agora.");
  }

  const html = await response.text();
  return parseIfoodPublicStorePage(html, sourceUrl);
}
