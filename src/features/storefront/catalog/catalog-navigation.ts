type SearchableProduct = {
  name?: string | null;
  description?: string | null;
  addons?: unknown;
};

type SellableProduct = {
  id: string;
  is_best_seller?: boolean | null;
  sold_quantity?: number | null;
};

export function normalizeCatalogText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isHomologationCategory(name: unknown) {
  return normalizeCatalogText(name).includes("homologacao");
}

function collectAddonText(addons: unknown) {
  if (!Array.isArray(addons)) return "";

  return addons
    .flatMap((group) => {
      if (!group || typeof group !== "object") return [];
      const candidate = group as {
        title?: string;
        name?: string;
        options?: Array<{ name?: string }>;
      };
      const optionNames = Array.isArray(candidate.options)
        ? candidate.options.map((option) => option?.name)
        : [];
      return [candidate.title, candidate.name, ...optionNames];
    })
    .filter(Boolean)
    .join(" ");
}

export function productMatchesSearch(product: SearchableProduct, search: string) {
  const term = normalizeCatalogText(search);
  if (!term) return true;

  const searchableText = normalizeCatalogText(
    [product.name, product.description, collectAddonText(product.addons)].filter(Boolean).join(" "),
  );
  return searchableText.includes(term);
}

export function getBestSellerProductId(products: SellableProduct[], minimumSales = 3) {
  const explicitLeader = products.find((product) => product.is_best_seller === true);
  if (explicitLeader) return explicitLeader.id;

  const leader = products.reduce<SellableProduct | null>((current, product) => {
    if (!current) return product;
    return Number(product.sold_quantity || 0) > Number(current.sold_quantity || 0)
      ? product
      : current;
  }, null);

  return leader && Number(leader.sold_quantity || 0) >= minimumSales ? leader.id : null;
}
