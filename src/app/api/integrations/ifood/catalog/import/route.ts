import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  listIfoodCatalogs,
  listIfoodCategories,
  listIfoodSellableItems,
  pickMainCatalog,
} from "@/lib/ifood/catalog";

type ImportPayload = {
  restaurantId?: string;
};

function normalizeMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ImportPayload;
    const restaurantId = body.restaurantId?.trim();

    if (!restaurantId) {
      return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: ownedRestaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, user_id")
      .eq("id", restaurantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (restaurantError || !ownedRestaurant) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    const admin = createAdminClient();

    const { data: integration, error: integrationError } = await admin
      .from("ifood_integrations")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: "Configure a integração iFood antes de importar o catálogo." },
        { status: 400 },
      );
    }

    if (!integration.merchant_id) {
      return NextResponse.json(
        { error: "Informe o ID do merchant do iFood nas configurações da loja." },
        { status: 400 },
      );
    }

    const merchantId = integration.merchant_id;
    let catalogId = integration.catalog_id;

    if (!catalogId) {
      const catalogs = await listIfoodCatalogs(merchantId);
      const mainCatalog = pickMainCatalog(catalogs);

      if (!mainCatalog) {
        return NextResponse.json(
          { error: "Nenhum catálogo disponível foi encontrado no iFood." },
          { status: 404 },
        );
      }

      catalogId = mainCatalog.catalogId;
    }

    const [categories, sellableItems] = await Promise.all([
      listIfoodCategories(merchantId, catalogId),
      listIfoodSellableItems(merchantId, catalogId),
    ]);

    const orderedCategories = [...categories].sort(
      (a, b) => Number(a.sequence || 0) - Number(b.sequence || 0),
    );

    const { data: existingCategoryLinks } = await admin
      .from("ifood_category_links")
      .select("id, category_id, ifood_category_id")
      .eq("restaurant_id", restaurantId);

    const { data: existingProductLinks } = await admin
      .from("ifood_product_links")
      .select("id, product_id, ifood_item_id")
      .eq("restaurant_id", restaurantId);

    const categoryLinkMap = new Map(
      (existingCategoryLinks || []).map((link) => [link.ifood_category_id, link.category_id]),
    );
    const productLinkMap = new Map(
      (existingProductLinks || []).map((link) => [link.ifood_item_id, link.product_id]),
    );

    const categoryIdByIfoodCategory = new Map<string, string>();
    let createdCategories = 0;
    let updatedCategories = 0;

    for (const category of orderedCategories) {
      const linkedCategoryId = categoryLinkMap.get(category.id);
      const nextOrder = Number(category.sequence || 0) + 1;

      if (linkedCategoryId) {
        await admin
          .from("categories")
          .update({
            name: category.name,
            order: nextOrder,
          })
          .eq("id", linkedCategoryId);

        categoryIdByIfoodCategory.set(category.id, linkedCategoryId);
        updatedCategories += 1;
      } else {
        const { data: createdCategory, error: createCategoryError } = await admin
          .from("categories")
          .insert({
            restaurant_id: restaurantId,
            name: category.name,
            order: nextOrder,
          })
          .select("id")
          .single();

        if (createCategoryError || !createdCategory) {
          throw new Error("Não foi possível criar uma categoria importada do iFood.");
        }

        await admin.from("ifood_category_links").insert({
          restaurant_id: restaurantId,
          category_id: createdCategory.id,
          ifood_category_id: category.id,
          ifood_catalog_id: catalogId,
          source: "ifood",
        });

        categoryIdByIfoodCategory.set(category.id, createdCategory.id);
        createdCategories += 1;
      }
    }

    let createdProducts = 0;
    let updatedProducts = 0;

    for (const item of sellableItems) {
      const ifoodItemId = item.itemId;
      const ifoodCategoryId = item.categoryId;

      if (!ifoodItemId || !ifoodCategoryId) continue;

      const localCategoryId = categoryIdByIfoodCategory.get(ifoodCategoryId);
      if (!localCategoryId) continue;

      const localProductPayload = {
        restaurant_id: restaurantId,
        category_id: localCategoryId,
        name: item.itemName?.trim() || "Produto importado do iFood",
        description: item.itemDescription?.trim() || null,
        price: normalizeMoney(item.itemPrice?.value),
        image_url:
          integration.import_images && Array.isArray(item.logosUrls)
            ? item.logosUrls[0] || null
            : null,
        is_active: true,
      };

      const linkedProductId = productLinkMap.get(ifoodItemId);

      if (linkedProductId) {
        await admin.from("products").update(localProductPayload).eq("id", linkedProductId);
        await admin
          .from("ifood_product_links")
          .update({
            ifood_category_id: ifoodCategoryId,
            ifood_catalog_id: catalogId,
            last_synced_at: new Date().toISOString(),
          })
          .eq("restaurant_id", restaurantId)
          .eq("ifood_item_id", ifoodItemId);

        updatedProducts += 1;
      } else {
        const { data: createdProduct, error: createProductError } = await admin
          .from("products")
          .insert(localProductPayload)
          .select("id")
          .single();

        if (createProductError || !createdProduct) {
          throw new Error("Não foi possível criar um produto importado do iFood.");
        }

        await admin.from("ifood_product_links").insert({
          restaurant_id: restaurantId,
          product_id: createdProduct.id,
          ifood_item_id: ifoodItemId,
          ifood_category_id: ifoodCategoryId,
          ifood_catalog_id: catalogId,
          source: "ifood",
          last_synced_at: new Date().toISOString(),
        });

        createdProducts += 1;
      }
    }

    await admin
      .from("ifood_integrations")
      .update({
        catalog_id: catalogId,
        status: integration.status === "disconnected" ? "configuring" : integration.status,
        last_catalog_import_at: new Date().toISOString(),
      })
      .eq("restaurant_id", restaurantId);

    return NextResponse.json({
      ok: true,
      summary: {
        catalogId,
        createdCategories,
        updatedCategories,
        createdProducts,
        updatedProducts,
        totalSellableItems: sellableItems.length,
      },
    });
  } catch (error) {
    console.error("Erro ao importar catálogo do iFood:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível importar o catálogo do iFood.",
      },
      { status: 500 },
    );
  }
}
