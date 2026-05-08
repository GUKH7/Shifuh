import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  listIfoodCatalogs,
  pickMainCatalog,
  validateIfoodCredentials,
} from "@/lib/ifood/catalog";

type ConnectionPayload = {
  restaurantId?: string;
  merchantId?: string;
  catalogId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConnectionPayload;
    const restaurantId = body.restaurantId?.trim();
    const merchantId = body.merchantId?.trim();
    const catalogId = body.catalogId?.trim();

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
    const checkedAt = new Date().toISOString();
    const details: string[] = [];

    await validateIfoodCredentials();
    details.push("As credenciais do app responderam corretamente no OAuth centralizado.");

    if (!merchantId) {
      return NextResponse.json({
        ok: true,
        stage: "credentials",
        checkedAt,
        details,
        merchantFound: false,
        catalogResolved: false,
        catalogsCount: 0,
        resolvedCatalogId: null,
        summary: "Credenciais válidas. Falta informar o ID do merchant para validar a loja no iFood.",
      });
    }

    const catalogs = await listIfoodCatalogs(merchantId);
    details.push(`O merchant respondeu com ${catalogs.length} catálogo(s) disponível(is).`);

    const resolvedCatalog =
      (catalogId && catalogs.find((catalog) => catalog.catalogId === catalogId)) ||
      pickMainCatalog(catalogs);

    const resolvedCatalogId = resolvedCatalog?.catalogId || null;
    const catalogResolved = Boolean(resolvedCatalogId);

    if (catalogId && !catalogResolved) {
      details.push("O catálogo informado não foi encontrado nessa loja do iFood.");
    } else if (catalogResolved && catalogId && catalogId === resolvedCatalogId) {
      details.push("O catálogo informado foi localizado e está pronto para importação.");
    } else if (catalogResolved && !catalogId) {
      details.push(`Usaremos automaticamente o catálogo ${resolvedCatalogId} na primeira importação.`);
    } else {
      details.push("A loja foi localizada, mas nenhum catálogo disponível pôde ser resolvido.");
    }

    await admin
      .from("ifood_integrations")
      .update({
        merchant_id: merchantId,
        catalog_id: resolvedCatalogId,
      })
      .eq("restaurant_id", restaurantId);

    return NextResponse.json({
      ok: true,
      stage: catalogResolved ? "catalog" : "merchant",
      checkedAt,
      details,
      merchantFound: true,
      catalogResolved,
      catalogsCount: catalogs.length,
      resolvedCatalogId,
      summary: catalogResolved
        ? "Conexão pronta: credenciais, merchant e catálogo estão acessíveis."
        : "As credenciais e o merchant estão válidos, mas ainda falta definir um catálogo utilizável.",
    });
  } catch (error) {
    console.error("Erro ao validar integração iFood:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível validar a conexão com o iFood.",
      },
      { status: 500 },
    );
  }
}
