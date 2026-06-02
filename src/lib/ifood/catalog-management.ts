import {
  ifoodRequest,
  listIfoodCatalogs,
  pickMainCatalog,
  type IfoodCategory,
} from "@/lib/ifood/catalog";

const SAMPLE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAKtJREFUeNrs2kEKwCAQBEG9/6V3LxJCYhMZkC2VLqI4bqYeXMbMzMx8R9+9wCkQAQkQgQgkQAQikAARiEACRCAACRCBCCRAhC5n2fUc3+v2Vcmr6u5PZsY2cYhAAhJIgAhEIAEikAARiEACRCAACRCBCCRAhF7OeZ7m+V3Wz1C7dVnP5Vg2IQIJEEEIJAEEIpAAEYhAAkQgAQkQgQgkQIR+AQYAZ7QJkE4KCVsAAAAASUVORK5CYII=";

export type IfoodCatalogItemPayload = {
  item: Record<string, unknown>;
  products: Record<string, unknown>[];
  optionGroups: Record<string, unknown>[];
  options: Record<string, unknown>[];
};

export type IfoodHomologationCatalogResult = {
  catalogId: string | null;
  category: IfoodCategory;
  itemId: string;
  productId: string;
  optionGroupId: string;
  optionIds: string[];
  imagePath: string | null;
  itemPayload: IfoodCatalogItemPayload;
  itemResponse: unknown;
  mutation?: {
    itemResponse: unknown;
    optionStatusResponse: unknown;
  };
};

const HOMOLOGATION_IDS = {
  categoryName: "Teste Homologacao",
  itemId: "11111111-1111-4111-8111-111111111111",
  productId: "22222222-2222-4222-8222-222222222222",
  optionGroupId: "33333333-3333-4333-8333-333333333333",
  optionOneProductId: "44444444-4444-4444-8444-444444444444",
  optionTwoProductId: "55555555-5555-4555-8555-555555555555",
  optionOneId: "66666666-6666-4666-8666-666666666666",
  optionTwoId: "77777777-7777-4777-8777-777777777777",
};

export async function resolveIfoodCatalogId(merchantId: string) {
  const catalogs = await listIfoodCatalogs(merchantId);
  return pickMainCatalog(catalogs)?.catalogId || null;
}

function isNoRouteError(error: unknown) {
  return error instanceof Error && /no route matched/i.test(error.message);
}

export async function listIfoodCategoriesV2(
  merchantId: string,
  includeItems = false,
  catalogId?: string | null,
) {
  const params = new URLSearchParams();
  if (includeItems) params.set("include_items", "true");
  const query = params.toString();

  try {
    return await ifoodRequest<IfoodCategory[]>(
      `/catalog/v2.0/merchants/${merchantId}/categories${query ? `?${query}` : ""}`,
    );
  } catch (error) {
    if (!catalogId || !isNoRouteError(error)) throw error;

    return ifoodRequest<IfoodCategory[]>(
      `/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/categories${query ? `?${query}` : ""}`,
    );
  }
}

export async function createIfoodCategory(
  merchantId: string,
  payload: { name: string; status?: string; template?: string },
  catalogId?: string | null,
) {
  const body = JSON.stringify({
    status: "AVAILABLE",
    template: "DEFAULT",
    ...payload,
  });

  try {
    return await ifoodRequest<IfoodCategory>(`/catalog/v2.0/merchants/${merchantId}/categories`, {
      method: "POST",
      body,
    });
  } catch (error) {
    if (!catalogId || !isNoRouteError(error)) throw error;

    return ifoodRequest<IfoodCategory>(
      `/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/categories`,
      {
        method: "POST",
        body,
      },
    );
  }
}

export async function findOrCreateIfoodCategory(
  merchantId: string,
  name: string,
  catalogId?: string | null,
) {
  const categories = await listIfoodCategoriesV2(merchantId, true, catalogId);
  const existing = categories.find((category) => category.name?.trim().toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  return createIfoodCategory(merchantId, {
    name,
    status: "AVAILABLE",
    template: "DEFAULT",
  }, catalogId);
}

export async function uploadIfoodCatalogImage(merchantId: string, image = SAMPLE_IMAGE) {
  const body = JSON.stringify({ image });

  try {
    const response = await ifoodRequest<{ imagePath?: string }>(
      `/catalog/v2.0/merchants/${merchantId}/image/upload`,
      {
        method: "POST",
        body,
      },
    );

    return response?.imagePath || null;
  } catch (error) {
    if (!isNoRouteError(error)) throw error;

    const response = await ifoodRequest<{ imagePath?: string }>(
      `/catalog/v2.0/merchants/${merchantId}/image/upload/`,
      {
        method: "POST",
        body,
      },
    ).catch(() => null);

    return response?.imagePath || null;
  }
}

export async function putIfoodItem(merchantId: string, payload: IfoodCatalogItemPayload) {
  return ifoodRequest<unknown>(`/catalog/v2.0/merchants/${merchantId}/items`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateIfoodOptionStatus(
  merchantId: string,
  optionId: string,
  status: "AVAILABLE" | "UNAVAILABLE",
) {
  return ifoodRequest<unknown>(`/catalog/v2.0/merchants/${merchantId}/options/status`, {
    method: "PATCH",
    body: JSON.stringify({ optionId, status }),
  });
}

function buildHomologationItemPayload(params: {
  categoryId: string;
  imagePath: string | null;
  variant?: "initial" | "changed";
}): IfoodCatalogItemPayload {
  const isChanged = params.variant === "changed";
  const itemName = isChanged ? "Produto Teste Alterado" : "Produto Teste";
  const optionTwoName = isChanged ? "Complemento Dois Alterado" : "Complemento Dois";

  return {
    item: {
      id: HOMOLOGATION_IDS.itemId,
      productId: HOMOLOGATION_IDS.productId,
      type: "DEFAULT",
      categoryId: params.categoryId,
      status: "AVAILABLE",
      price: { value: isChanged ? 34.9 : 29.9 },
      externalCode: "GESTOR_HOMOLOG_ITEM_001",
    },
    products: [
      {
        id: HOMOLOGATION_IDS.productId,
        name: itemName,
        description: isChanged
          ? "Produto alterado para o cenário de homologação Catalog."
          : "Produto criado pelo Gestor Delivery para homologação Catalog.",
        externalCode: "GESTOR_HOMOLOG_PRODUCT_001",
        ...(params.imagePath ? { imagePath: params.imagePath } : { image: SAMPLE_IMAGE }),
        optionGroups: [
          {
            id: HOMOLOGATION_IDS.optionGroupId,
            min: 0,
            max: 2,
            index: 0,
          },
        ],
      },
      {
        id: HOMOLOGATION_IDS.optionOneProductId,
        name: "Complemento Um",
        description: "Primeiro complemento de homologação.",
        externalCode: "GESTOR_HOMOLOG_OPTION_PRODUCT_001",
        ...(params.imagePath ? { imagePath: params.imagePath } : { image: SAMPLE_IMAGE }),
      },
      {
        id: HOMOLOGATION_IDS.optionTwoProductId,
        name: optionTwoName,
        description: "Segundo complemento de homologação.",
        externalCode: "GESTOR_HOMOLOG_OPTION_PRODUCT_002",
        ...(params.imagePath ? { imagePath: params.imagePath } : { image: SAMPLE_IMAGE }),
      },
    ],
    optionGroups: [
      {
        id: HOMOLOGATION_IDS.optionGroupId,
        name: "Grupo de Complementos Homologacao",
        status: "AVAILABLE",
        optionGroupType: "OFFER_UNIT",
        optionIds: [HOMOLOGATION_IDS.optionOneId, HOMOLOGATION_IDS.optionTwoId],
      },
    ],
    options: [
      {
        id: HOMOLOGATION_IDS.optionOneId,
        productId: HOMOLOGATION_IDS.optionOneProductId,
        status: "AVAILABLE",
        price: { value: 4.5 },
      },
      {
        id: HOMOLOGATION_IDS.optionTwoId,
        productId: HOMOLOGATION_IDS.optionTwoProductId,
        status: "AVAILABLE",
        price: { value: isChanged ? 7.9 : 6.5 },
      },
    ],
  };
}

export async function prepareIfoodCatalogHomologation(
  merchantId: string,
): Promise<IfoodHomologationCatalogResult> {
  const catalogId = await resolveIfoodCatalogId(merchantId);
  const [category, imagePath] = await Promise.all([
    findOrCreateIfoodCategory(merchantId, HOMOLOGATION_IDS.categoryName, catalogId),
    uploadIfoodCatalogImage(merchantId),
  ]);
  const itemPayload = buildHomologationItemPayload({
    categoryId: category.id,
    imagePath,
    variant: "initial",
  });
  const itemResponse = await putIfoodItem(merchantId, itemPayload);

  return {
    catalogId,
    category,
    itemId: HOMOLOGATION_IDS.itemId,
    productId: HOMOLOGATION_IDS.productId,
    optionGroupId: HOMOLOGATION_IDS.optionGroupId,
    optionIds: [HOMOLOGATION_IDS.optionOneId, HOMOLOGATION_IDS.optionTwoId],
    imagePath,
    itemPayload,
    itemResponse,
  };
}

export async function mutateIfoodCatalogHomologation(
  merchantId: string,
): Promise<IfoodHomologationCatalogResult> {
  const catalogId = await resolveIfoodCatalogId(merchantId);
  const [category, imagePath] = await Promise.all([
    findOrCreateIfoodCategory(merchantId, HOMOLOGATION_IDS.categoryName, catalogId),
    uploadIfoodCatalogImage(merchantId),
  ]);
  const itemPayload = buildHomologationItemPayload({
    categoryId: category.id,
    imagePath,
    variant: "changed",
  });
  const itemResponse = await putIfoodItem(merchantId, itemPayload);
  const optionStatusResponse = await updateIfoodOptionStatus(
    merchantId,
    HOMOLOGATION_IDS.optionTwoId,
    "UNAVAILABLE",
  );

  return {
    catalogId,
    category,
    itemId: HOMOLOGATION_IDS.itemId,
    productId: HOMOLOGATION_IDS.productId,
    optionGroupId: HOMOLOGATION_IDS.optionGroupId,
    optionIds: [HOMOLOGATION_IDS.optionOneId, HOMOLOGATION_IDS.optionTwoId],
    imagePath,
    itemPayload,
    itemResponse,
    mutation: {
      itemResponse,
      optionStatusResponse,
    },
  };
}
