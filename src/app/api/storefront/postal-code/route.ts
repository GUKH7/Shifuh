import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

type PostalCodeSearchBody = {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

type ViaCepAddress = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

function normalize(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isValidText(value: string, minimum: number, maximum: number) {
  return value.length >= minimum && value.length <= maximum;
}

export async function POST(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "public:postal-code-search",
    limit: 15,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = JSON.parse(await request.text()) as PostalCodeSearchBody;
    const street = body.street?.trim() || "";
    const number = body.number?.trim() || "";
    const neighborhood = body.neighborhood?.trim() || "";
    const city = body.city?.trim() || "";
    const state = body.state?.trim().toUpperCase() || "";

    if (
      !isValidText(street, 3, 120) ||
      !isValidText(number, 1, 20) ||
      !isValidText(neighborhood, 2, 100) ||
      !isValidText(city, 3, 100) ||
      !/^[A-Z]{2}$/.test(state)
    ) {
      return NextResponse.json(
        { error: "Preencha rua, número, bairro, cidade e UF para buscar o CEP." },
        { status: 400 },
      );
    }

    const url = `https://viacep.com.br/ws/${encodeURIComponent(state)}/${encodeURIComponent(city)}/${encodeURIComponent(street)}/json/`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "A busca de CEP está indisponível agora. Tente novamente em instantes." },
        { status: 503 },
      );
    }

    const data = (await response.json()) as ViaCepAddress[];
    const expectedCity = normalize(city);
    const expectedNeighborhood = normalize(neighborhood);
    const candidates = (Array.isArray(data) ? data : [])
      .filter((item) =>
        /^\d{5}-?\d{3}$/.test(item.cep || "") &&
        item.uf?.toUpperCase() === state &&
        normalize(item.localidade) === expectedCity,
      )
      .map((item) => ({
        cep: item.cep || "",
        street: item.logradouro || street,
        neighborhood: item.bairro || neighborhood,
        city: item.localidade || city,
        state: item.uf || state,
        complement: item.complemento || "",
        score: normalize(item.bairro) === expectedNeighborhood ? 2 : normalize(item.bairro).includes(expectedNeighborhood) ? 1 : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ score: _score, ...item }) => item);

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "Não encontramos um CEP para esse endereço. Confira os dados ou informe o CEP manualmente." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { candidates },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("Postal code search failed", error);
    return NextResponse.json(
      { error: "Não foi possível buscar o CEP agora. Tente novamente." },
      { status: 500 },
    );
  }
}
