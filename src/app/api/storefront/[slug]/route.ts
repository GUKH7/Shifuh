import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getPublicStorefrontData,
  isPublicStorefrontConfigured,
} from "@/lib/storefront/public-data";

export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "public:storefront:data",
    limit: 120,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPublicStorefrontConfigured()) {
    return NextResponse.json(
      {
        code: "STOREFRONT_NOT_CONFIGURED",
        error: "A vitrine pública não está configurada neste ambiente.",
      },
      { status: 503 },
    );
  }

  const { slug } = await params;
  if (!slug?.trim()) {
    return NextResponse.json(
      { code: "MISSING_STORE_SLUG", error: "Loja não informada." },
      { status: 400 },
    );
  }

  try {
    const storefront = await getPublicStorefrontData(slug);
    if (!storefront) {
      return NextResponse.json(
        { code: "STORE_NOT_FOUND", error: "Loja não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(storefront, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Erro ao carregar vitrine pública", error);
    return NextResponse.json(
      { code: "STOREFRONT_UNAVAILABLE", error: "Não foi possível carregar a vitrine agora." },
      { status: 500 },
    );
  }
}
