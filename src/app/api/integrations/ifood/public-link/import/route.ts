import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  fetchIfoodPublicStoreData,
  hydrateIfoodPublicMenuAddons,
} from "@/lib/ifood/public-page";
import { scrapeIfoodPublicMenu } from "@/lib/ifood/public-menu-importer";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

type ImportFromPublicLinkPayload = {
  restaurantId?: string;
  publicUrl?: string;
  importStoreProfile?: boolean;
};

function buildRestaurantUpdate(current: Record<string, any>, imported: Awaited<ReturnType<typeof fetchIfoodPublicStoreData>>) {
  const currentBanners = Array.isArray(current.banners) ? current.banners : [];

  return {
    name: imported.name || current.name,
    phone: current.phone || imported.phone || null,
    logo_url: current.logo_url || imported.logoUrl || null,
    image_url: current.image_url || current.logo_url || imported.logoUrl || null,
    banners:
      currentBanners.length > 0
        ? currentBanners
        : imported.coverUrl
          ? [imported.coverUrl]
          : currentBanners,
    storefront_headline: current.storefront_headline || imported.name || null,
    storefront_subheadline:
      current.storefront_subheadline || imported.description || null,
    address_zip: current.address_zip || imported.address.zip || null,
    address_street: current.address_street || imported.address.street || null,
    address_number: current.address_number || imported.address.number || null,
    address_neighborhood:
      current.address_neighborhood || imported.address.neighborhood || null,
    address_city: current.address_city || imported.address.city || null,
    address_state: current.address_state || imported.address.state || null,
    latitude: current.latitude ?? imported.location.latitude,
    longitude: current.longitude ?? imported.location.longitude,
  };
}

function normalizeMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function POST(request: Request) {
  try {
    const rateLimitResponse = checkRateLimit(request, {
      keyPrefix: "ifood-public-link-import",
      limit: 6,
      windowMs: 10 * 60_000,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await request.json()) as ImportFromPublicLinkPayload;
    const restaurantId = body.restaurantId?.trim();
    const publicUrl = body.publicUrl?.trim();
    const importStoreProfile = body.importStoreProfile === true;

    if (!restaurantId) {
      return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
    }

    if (!publicUrl) {
      return NextResponse.json({ error: "Cole o link público do iFood." }, { status: 400 });
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
      .select("*")
      .eq("id", restaurantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (restaurantError || !ownedRestaurant) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    const admin = createAdminClient();
    const imported = await fetchIfoodPublicStoreData(publicUrl);
    let importedMenuSections = imported.menuSections;

    if (importedMenuSections.length === 0) {
      try {
        importedMenuSections = await scrapeIfoodPublicMenu(publicUrl, {
          street: imported.address.street,
          number: imported.address.number,
          neighborhood: imported.address.neighborhood,
          city: imported.address.city,
          state: imported.address.state,
        });
      } catch (error) {
        console.error("Fallback headless do iFood falhou:", error);
      }
    }

    importedMenuSections = await hydrateIfoodPublicMenuAddons(
      importedMenuSections,
      imported.merchantUuid,
      publicUrl,
    );

    if (importStoreProfile) {
      const restaurantUpdate = buildRestaurantUpdate(ownedRestaurant, imported);
      const { error: updateRestaurantError } = await admin
        .from("restaurants")
        .update(restaurantUpdate)
        .eq("id", restaurantId);

      if (updateRestaurantError) {
        throw new Error("Não foi possível atualizar os dados da loja com o link informado.");
      }

      await admin.from("ifood_integrations").upsert(
        {
          restaurant_id: restaurantId,
          merchant_id: imported.merchantUuid,
          merchant_name: imported.name || ownedRestaurant.name,
          status: "configuring",
          notes: `Importado por link público em ${new Date().toLocaleString("pt-BR")}`,
        },
        { onConflict: "restaurant_id" },
      );
    }

    let createdCategories = 0;
    let updatedCategories = 0;
    let createdProducts = 0;
    let updatedProducts = 0;
    let addonGroupsProcessed = 0;
    let addonOptionsProcessed = 0;

    if (importedMenuSections.length > 0) {
      const { data: existingCategoryLinks } = await admin
        .from("ifood_category_links")
        .select("category_id, ifood_category_id")
        .eq("restaurant_id", restaurantId);

      const { data: existingProductLinks } = await admin
        .from("ifood_product_links")
        .select("product_id, ifood_item_id")
        .eq("restaurant_id", restaurantId);

      const categoryLinkMap = new Map(
        (existingCategoryLinks || []).map((link) => [link.ifood_category_id, link.category_id]),
      );
      const productLinkMap = new Map(
        (existingProductLinks || []).map((link) => [link.ifood_item_id, link.product_id]),
      );

      const categoryIdByImportedCategory = new Map<string, string>();

      for (const [index, section] of importedMenuSections.entries()) {
        const linkedCategoryId = categoryLinkMap.get(section.id);
        const categoryPayload = {
          restaurant_id: restaurantId,
          name: section.name,
          order: index + 1,
        };

        if (linkedCategoryId) {
          await admin.from("categories").update(categoryPayload).eq("id", linkedCategoryId);
          categoryIdByImportedCategory.set(section.id, linkedCategoryId);
          updatedCategories += 1;
        } else {
          const { data: createdCategory, error: createCategoryError } = await admin
            .from("categories")
            .insert(categoryPayload)
            .select("id")
            .single();

          if (createCategoryError || !createdCategory) {
            throw new Error("Não foi possível criar uma categoria importada do link do iFood.");
          }

          await admin.from("ifood_category_links").insert({
            restaurant_id: restaurantId,
            category_id: createdCategory.id,
            ifood_category_id: section.id,
            ifood_catalog_id: imported.shortId,
            source: "public_link",
          });

          categoryIdByImportedCategory.set(section.id, createdCategory.id);
          createdCategories += 1;
        }
      }

      for (const section of importedMenuSections) {
        const localCategoryId = categoryIdByImportedCategory.get(section.id);
        if (!localCategoryId) continue;

        for (const item of section.items) {
          const linkedProductId = productLinkMap.get(item.id);
          const importedPrice = normalizeMoney(item.price);
          const importedAddons = Array.isArray(item.addons) ? item.addons : [];
          const productPayload = {
            restaurant_id: restaurantId,
            category_id: localCategoryId,
            name: item.name,
            description: item.description,
            price: importedPrice,
            image_url: item.imageUrl,
            addons: importedAddons,
            is_active: importedPrice > 0,
          };

          addonGroupsProcessed += importedAddons.length;
          addonOptionsProcessed += importedAddons.reduce(
            (total, group) => total + (Array.isArray(group.options) ? group.options.length : 0),
            0,
          );

          if (linkedProductId) {
            await admin.from("products").update(productPayload).eq("id", linkedProductId);
            await admin
              .from("ifood_product_links")
              .update({
                ifood_category_id: section.id,
                ifood_catalog_id: imported.shortId,
                source: "public_link",
                last_synced_at: new Date().toISOString(),
              })
              .eq("restaurant_id", restaurantId)
              .eq("ifood_item_id", item.id);

            updatedProducts += 1;
          } else {
            const { data: createdProduct, error: createProductError } = await admin
              .from("products")
              .insert(productPayload)
              .select("id")
              .single();

            if (createProductError || !createdProduct) {
              throw new Error("Não foi possível criar um produto importado do link do iFood.");
            }

            await admin.from("ifood_product_links").insert({
              restaurant_id: restaurantId,
              product_id: createdProduct.id,
              ifood_item_id: item.id,
              ifood_category_id: section.id,
              ifood_catalog_id: imported.shortId,
              source: "public_link",
              last_synced_at: new Date().toISOString(),
            });

            createdProducts += 1;
          }
        }
      }
    }

    if (importedMenuSections.length === 0) {
      return NextResponse.json(
        {
          error:
            "O link da loja foi reconhecido, mas o iFood não disponibilizou o cardápio para importação agora. Tente novamente mais tarde.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      summary: {
        merchantUuid: imported.merchantUuid,
        storeName: imported.name,
        menuFound: importedMenuSections.length > 0,
        categoriesProcessed: createdCategories + updatedCategories,
        productsProcessed: createdProducts + updatedProducts,
        createdCategories,
        updatedCategories,
        createdProducts,
        updatedProducts,
        addonGroupsProcessed,
        addonOptionsProcessed,
      },
      details:
        importStoreProfile
          ? [
              "Os dados públicos da loja e o cardápio visível foram importados.",
              "Você pode revisar as categorias e os produtos no Gestor antes de publicar.",
            ]
          : [
              "O cardápio visível foi importado sem alterar o nome, o endereço ou a identidade da sua loja.",
              "Revise preços, imagens e disponibilidade antes de publicar.",
            ],
    });
  } catch (error) {
    console.error("Erro ao importar cardápio do link público do iFood:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível importar o conteúdo do link público do iFood.",
      },
      { status: 500 },
    );
  }
}
