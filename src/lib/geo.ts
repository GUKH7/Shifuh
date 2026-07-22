// src/lib/geo.ts

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return parseFloat(distance.toFixed(1));
}

export function calculateDeliveryFee(distance: number, tiers: any[]) {
  if (!tiers || tiers.length === 0) return { price: 0, time: 0, valid: true };

  const sortedTiers = [...tiers].sort((a, b) => Number(a.distance) - Number(b.distance));
  const foundTier = sortedTiers.find((tier) => distance <= Number(tier.distance));

  if (foundTier) {
    return {
      price: Number(foundTier.price) || 0,
      time: Number(foundTier.time) || 0,
      valid: true,
    };
  }

  return { price: 0, time: 0, valid: false };
}

function normalizeAddress(address: string) {
  return address
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,+/g, ",")
    .trim();
}

function extractPostalCode(address: string) {
  const digits = address.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.slice(0, 8);
}

export type GeocodingAddress = {
  postalCode?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    postcode?: string;
    quarter?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    city_district?: string;
    county?: string;
    state_district?: string;
    state?: string;
    "ISO3166-2-lvl4"?: string;
  };
};

type PhotonResult = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
};

const coordinateCache = new Map<string, { lat: number; lon: number; expiresAt: number }>();
const GEOCODING_CACHE_TTL_MS = 30 * 60 * 1000;
const GEOCODING_USER_AGENT = "GestorDelivery/1.0 (+https://gestor-delivery-tau.vercel.app)";

const BRAZILIAN_STATE_NAMES: Record<string, string> = {
  AC: "acre", AL: "alagoas", AP: "amapa", AM: "amazonas", BA: "bahia", CE: "ceara",
  DF: "distrito federal", ES: "espirito santo", GO: "goias", MA: "maranhao", MT: "mato grosso",
  MS: "mato grosso do sul", MG: "minas gerais", PA: "para", PB: "paraiba", PR: "parana",
  PE: "pernambuco", PI: "piaui", RJ: "rio de janeiro", RN: "rio grande do norte",
  RS: "rio grande do sul", RO: "rondonia", RR: "roraima", SC: "santa catarina",
  SP: "sao paulo", SE: "sergipe", TO: "tocantins",
};

function normalizeComparable(value?: string) {
  return normalizeAddress(value || "").toLowerCase();
}

function normalizePostalCode(value?: string) {
  return (value || "").replace(/\D/g, "");
}

function looselyMatches(value: string | undefined, expected: string | undefined) {
  const normalizedValue = normalizeComparable(value);
  const normalizedExpected = normalizeComparable(expected);
  if (!normalizedValue || !normalizedExpected) return false;
  return normalizedValue.includes(normalizedExpected) || normalizedExpected.includes(normalizedValue);
}

function matchesExpectedState(resultState: string | undefined, resultCode: string | undefined, expectedState: string) {
  const normalizedExpected = normalizeComparable(expectedState);
  if (!normalizedExpected) return true;

  const expectedName = BRAZILIAN_STATE_NAMES[expectedState.toUpperCase()] || normalizedExpected;
  return normalizeComparable(resultState) === expectedName || normalizeComparable(resultCode) === normalizedExpected;
}

function matchesExpectedLocation(result: NominatimResult, expected: GeocodingAddress) {
  const expectedCity = normalizeComparable(expected.city);
  const expectedState = normalizeComparable(expected.state);
  const resultCity = normalizeComparable(
    result.address?.city ||
      result.address?.town ||
      result.address?.village ||
      result.address?.municipality ||
      result.address?.city_district ||
      result.address?.county ||
      result.address?.state_district,
  );

  if (expectedCity && resultCity !== expectedCity) return false;
  if (!matchesExpectedState(result.address?.state, result.address?.["ISO3166-2-lvl4"]?.split("-").pop(), expectedState)) return false;
  return true;
}

function matchesExpectedPhotonLocation(result: PhotonResult, expected: GeocodingAddress) {
  const expectedCity = normalizeComparable(expected.city);
  const resultCity = normalizeComparable(
    result.properties?.city || result.properties?.district || result.properties?.county,
  );
  if (expectedCity && resultCity !== expectedCity) return false;
  return matchesExpectedState(result.properties?.state, undefined, expected.state || "");
}

function matchesExpectedNominatimAddress(result: NominatimResult, expected: GeocodingAddress) {
  const expectedPostalCode = normalizePostalCode(expected.postalCode);
  const resultPostalCode = normalizePostalCode(result.address?.postcode);
  const resultStreet = result.address?.road || result.address?.pedestrian;

  if (expectedPostalCode && resultPostalCode) return resultPostalCode === expectedPostalCode;
  return looselyMatches(resultStreet, expected.street);
}

function matchesExpectedPhotonAddress(result: PhotonResult, expected: GeocodingAddress) {
  const expectedPostalCode = normalizePostalCode(expected.postalCode);
  const resultPostalCode = normalizePostalCode(result.properties?.postcode);
  const resultStreet = result.properties?.street || result.properties?.name;

  if (expectedPostalCode && resultPostalCode) return resultPostalCode === expectedPostalCode;
  return looselyMatches(resultStreet, expected.street);
}

function buildStructuredAttempts(address: GeocodingAddress) {
  const locality = [address.city, address.state, "Brasil"].filter(Boolean);
  const attempts = [
    [address.street, address.number, address.neighborhood, ...locality],
    [address.street, address.neighborhood, ...locality],
    [address.street, ...locality],
    [address.neighborhood, ...locality],
  ];

  return Array.from(
    new Set(attempts.map((parts) => normalizeAddress(parts.filter(Boolean).join(", ")))),
  ).filter(Boolean);
}

function buildAddressAttempts(address: string) {
  const normalized = normalizeAddress(address);
  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const attempts = new Set<string>();

  if (normalized) attempts.add(normalized);
  if (parts.length >= 5) attempts.add([parts[0], parts[1], parts[3], parts[4], "Brasil"].join(", "));
  if (parts.length >= 4) attempts.add([parts[0], parts[2], parts[3], parts[4], "Brasil"].join(", "));
  if (parts.length >= 3) attempts.add([parts[0], parts[parts.length - 2], parts[parts.length - 1], "Brasil"].join(", "));

  const noNumber = normalized.replace(/\b\d+\b/g, "").replace(/\s+,/g, ",").trim();
  if (noNumber) attempts.add(noNumber);

  return Array.from(attempts).filter((item) => item.length > 0);
}

export async function getCoordinates(address: string | GeocodingAddress) {
  const structured = typeof address === "string" ? null : address;
  const rawAddress = typeof address === "string" ? address : Object.values(address).join(", ");
  const postalCode = structured?.postalCode?.replace(/\D/g, "") || extractPostalCode(rawAddress);
  const attempts = structured ? buildStructuredAttempts(structured) : buildAddressAttempts(rawAddress);
  const preciseAttempts = structured?.street
    ? attempts.filter((attempt) => looselyMatches(attempt, structured.street))
    : attempts;
  const broadAttempts = attempts.filter((attempt) => !preciseAttempts.includes(attempt));
  const cacheKey = normalizeComparable(`${rawAddress}|${postalCode || ""}`);
  const cached = coordinateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { lat: cached.lat, lon: cached.lon };

  const remember = (lat: number, lon: number) => {
    const coordinates = { lat, lon };
    coordinateCache.set(cacheKey, { ...coordinates, expiresAt: Date.now() + GEOCODING_CACHE_TTL_MS });
    if (coordinateCache.size > 200) coordinateCache.delete(coordinateCache.keys().next().value as string);
    return coordinates;
  };

  let nominatimUnavailable = false;

  for (const attempt of preciseAttempts) {
    try {
      const query = encodeURIComponent(attempt);
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&addressdetails=1&limit=5&q=${query}`;
      const res = await fetch(url, {
        headers: {
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "User-Agent": GEOCODING_USER_AGENT,
        },
        signal: AbortSignal.timeout(4500),
      });

      if (!res.ok) {
        if (res.status === 403 || res.status === 429 || res.status >= 500) {
          nominatimUnavailable = true;
          break;
        }
        continue;
      }

      const data = (await res.json()) as NominatimResult[];
      const match = structured
        ? data.find(
            (result) =>
              matchesExpectedLocation(result, structured) &&
              matchesExpectedNominatimAddress(result, structured),
          )
        : data[0];
      if (match?.lat && match?.lon) {
        return remember(parseFloat(match.lat), parseFloat(match.lon));
      }
    } catch (error) {
      console.error("Erro GPS:", error);
      nominatimUnavailable = true;
      break;
    }
  }

  if (postalCode && !nominatimUnavailable) {
    try {
      const postalUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&addressdetails=1&postalcode=${postalCode}&limit=5`;
      const postalRes = await fetch(postalUrl, {
        headers: { "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8", "User-Agent": GEOCODING_USER_AGENT },
        signal: AbortSignal.timeout(4500),
      });
      if (postalRes.ok) {
        const postalData = (await postalRes.json()) as NominatimResult[];
        const match = structured
          ? postalData.find((result) => matchesExpectedLocation(result, structured))
          : postalData[0];
        if (match?.lat && match?.lon) {
          return remember(parseFloat(match.lat), parseFloat(match.lon));
        }
      }
    } catch (error) {
      console.error("Erro GPS CEP:", error);
    }
  }

  if (!nominatimUnavailable) {
    for (const attempt of broadAttempts) {
      try {
        const query = encodeURIComponent(attempt);
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&addressdetails=1&limit=5&q=${query}`;
        const res = await fetch(url, {
          headers: {
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            "User-Agent": GEOCODING_USER_AGENT,
          },
          signal: AbortSignal.timeout(4500),
        });
        if (!res.ok) continue;

        const data = (await res.json()) as NominatimResult[];
        const match = structured
          ? data.find((result) => matchesExpectedLocation(result, structured))
          : data[0];
        if (match?.lat && match?.lon) return remember(parseFloat(match.lat), parseFloat(match.lon));
      } catch (error) {
        console.error("Erro GPS aproximado:", error);
      }
    }
  }

  for (const attempt of preciseAttempts.slice(0, 2)) {
    try {
      const photonUrl = `https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(attempt)}`;
      const photonRes = await fetch(photonUrl, {
        headers: { "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8", "User-Agent": GEOCODING_USER_AGENT },
        signal: AbortSignal.timeout(4500),
      });
      if (!photonRes.ok) continue;

      const photonData = (await photonRes.json()) as { features?: PhotonResult[] };
      const match = photonData.features?.find((result) =>
        structured
          ? matchesExpectedPhotonLocation(result, structured) &&
            matchesExpectedPhotonAddress(result, structured)
          : true,
      );
      const coordinates = match?.geometry?.coordinates;
      if (coordinates && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
        return remember(coordinates[1], coordinates[0]);
      }
    } catch (error) {
      console.error("Erro GPS alternativo:", error);
    }
  }

  return null;
}
