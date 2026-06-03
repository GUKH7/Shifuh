import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  type IfoodCatalogHomologationIds,
  mutateIfoodCatalogHomologation,
  prepareIfoodCatalogHomologation,
} from "@/lib/ifood/catalog-management";

type CatalogManageAction = "prepare_homologation" | "mutate_homologation";

type CatalogManagePayload = {
  restaurantId?: string;
  action?: CatalogManageAction;
};

function createHomologationIds(): IfoodCatalogHomologationIds {
  return {
    itemId: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    optionGroupId: crypto.randomUUID(),
    optionOneProductId: crypto.randomUUID(),
    optionTwoProductId: crypto.randomUUID(),
    optionOneId: crypto.randomUUID(),
    optionTwoId: crypto.randomUUID(),
  };
}

function parseIntegrationNotes(notes?: string | null) {
  if (!notes?.trim()) return {};

  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { text: notes };
  }
}

function getSavedCatalogIds(notes?: string | null): IfoodCatalogHomologationIds | null {
  const parsed = parseIntegrationNotes(notes);
  const ids = parsed.catalogHomologationIds as Partial<IfoodCatalogHomologationIds> | undefined;

  if (
    ids?.itemId &&
    ids.productId &&
    ids.optionGroupId &&
    ids.optionOneProductId &&
    ids.optionTwoProductId &&
    ids.optionOneId &&
    ids.optionTwoId
  ) {
    return ids as IfoodCatalogHomologationIds;
  }

  return null;
}

function stringifyIntegrationNotes(
  notes: string | null | undefined,
  ids: IfoodCatalogHomologationIds,
) {
  return JSON.stringify({
    ...parseIntegrationNotes(notes),
    catalogHomologationIds: ids,
    catalogHomologationUpdatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CatalogManagePayload;
    const restaurantId = body.restaurantId?.trim();
    const action = body.action || "prepare_homologation";

    if (!restaurantId) {
      return NextResponse.json({ error: "Loja invÃ¡lida." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "NÃ£o autenticado." }, { status: 401 });
    }

    const { data: ownedRestaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id")
      .eq("id", restaurantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (restaurantError || !ownedRestaurant) {
      return NextResponse.json({ error: "Loja nÃ£o encontrada." }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data: integration, error: integrationError } = await admin
      .from("ifood_integrations")
      .select("merchant_id, status, notes")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (integrationError || !integration?.merchant_id) {
      return NextResponse.json(
        { error: "Configure o merchant do iFood antes de publicar o catÃ¡logo." },
        { status: 400 },
      );
    }

    const savedIds = getSavedCatalogIds(integration.notes);
    const ids = savedIds || createHomologationIds();

    const result =
      action === "mutate_homologation"
        ? await mutateIfoodCatalogHomologation(integration.merchant_id, ids)
        : action === "prepare_homologation"
          ? await prepareIfoodCatalogHomologation(integration.merchant_id, ids)
          : null;

    if (!result) {
      return NextResponse.json({ error: "AÃ§Ã£o Catalog invÃ¡lida." }, { status: 400 });
    }

    await admin
      .from("ifood_integrations")
      .update({
        catalog_id: result.catalogId,
        catalog_sync_enabled: true,
        status: integration.status === "disconnected" ? "configuring" : integration.status,
        last_catalog_export_at: new Date().toISOString(),
        notes: stringifyIntegrationNotes(integration.notes, ids),
      })
      .eq("restaurant_id", restaurantId);

    return NextResponse.json({
      ok: true,
      action,
      summary: {
        catalogId: result.catalogId,
        categoryId: result.category.id,
        categoryName: result.category.name,
        itemId: result.itemId,
        productId: result.productId,
        optionGroupId: result.optionGroupId,
        optionIds: result.optionIds,
        imagePath: result.imagePath,
        optionPaused: action === "mutate_homologation",
      },
    });
  } catch (error) {
    console.error("Erro ao gerenciar catÃ¡logo do iFood:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "NÃ£o foi possÃ­vel publicar o cenÃ¡rio de catÃ¡logo no iFood.",
      },
      { status: 500 },
    );
  }
}
