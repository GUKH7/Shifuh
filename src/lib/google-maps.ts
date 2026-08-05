export type GoogleMapsCoordinates = {
  lat: number;
  lon: number;
};

export type GoogleMapsAddress = {
  postalCode?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export type GoogleDrivingRoute = {
  distanceKm: number;
  durationMinutes: number;
};

type GoogleGeocodingResponse = {
  status?: string;
  results?: Array<{
    partial_match?: boolean;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
      location_type?: string;
    };
  }>;
};

type GoogleRoutesResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
  }>;
};

const GOOGLE_TIMEOUT_MS = 7000;

export function getGoogleMapsApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_ROUTES_API_KEY ||
    ""
  ).trim();
}

export function shouldUseGoogleMaps() {
  const provider = (process.env.ROUTING_PROVIDER || "auto").trim().toLowerCase();
  return provider === "google" || (provider === "auto" && Boolean(getGoogleMapsApiKey()));
}

export function requiresGoogleMaps() {
  return (process.env.ROUTING_PROVIDER || "auto").trim().toLowerCase() === "google";
}

function isValidCoordinates(coordinates: GoogleMapsCoordinates) {
  return (
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lon) &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    coordinates.lon >= -180 &&
    coordinates.lon <= 180 &&
    !(coordinates.lat === 0 && coordinates.lon === 0)
  );
}

function buildAddress(address: GoogleMapsAddress) {
  return [
    address.street,
    address.number,
    address.neighborhood,
    address.city,
    address.state,
    address.postalCode,
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");
}

function parseGoogleDuration(value?: string) {
  if (!value) return null;
  const seconds = Number(value.replace(/s$/i, ""));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export async function geocodeAddressWithGoogle(
  address: GoogleMapsAddress,
): Promise<GoogleMapsCoordinates | null> {
  const apiKey = getGoogleMapsApiKey();
  const formattedAddress = buildAddress(address);
  if (!apiKey || !formattedAddress) return null;

  const params = new URLSearchParams({
    address: formattedAddress,
    key: apiKey,
    language: "pt-BR",
    region: "br",
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as GoogleGeocodingResponse;
    if (data.status !== "OK") return null;

    const result = data.results?.find((candidate) => {
      const location = candidate.geometry?.location;
      return (
        Number.isFinite(location?.lat) &&
        Number.isFinite(location?.lng) &&
        candidate.geometry?.location_type !== "APPROXIMATE"
      );
    }) || data.results?.[0];

    const coordinates = {
      lat: Number(result?.geometry?.location?.lat),
      lon: Number(result?.geometry?.location?.lng),
    };

    return isValidCoordinates(coordinates) ? coordinates : null;
  } catch (error) {
    console.error("Erro ao geocodificar endereço pelo Google Maps:", error);
    return null;
  }
}

export async function getGoogleDrivingRoute(
  origin: GoogleMapsCoordinates,
  destination: GoogleMapsCoordinates,
): Promise<GoogleDrivingRoute | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || !isValidCoordinates(origin) || !isValidCoordinates(destination)) return null;

  try {
    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: origin.lat,
                longitude: origin.lon,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destination.lat,
                longitude: destination.lon,
              },
            },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          computeAlternativeRoutes: false,
          languageCode: "pt-BR",
          units: "METRIC",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.error("Google Routes API respondeu com status:", response.status);
      return null;
    }

    const data = (await response.json()) as GoogleRoutesResponse;
    const route = data.routes?.[0];
    const distanceMeters = Number(route?.distanceMeters);
    const durationSeconds = parseGoogleDuration(route?.duration);

    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0 ||
      durationSeconds === null
    ) {
      return null;
    }

    return {
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    };
  } catch (error) {
    console.error("Erro ao calcular rota pelo Google Maps:", error);
    return null;
  }
}
