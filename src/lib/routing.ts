import {
  getGoogleDrivingRoute,
  requiresGoogleMaps,
  shouldUseGoogleMaps,
} from "@/lib/google-maps";
import { SHIFUH_BRAND } from "@/lib/brand";

export type RouteCoordinates = {
  lat: number;
  lon: number;
};

export type RoadRoute = {
  distanceKm: number;
  durationMinutes: number;
  provider: "google" | "osrm";
};

type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
  }>;
};

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const ROUTE_CACHE_LIMIT = 500;
const routeCache = new Map<string, { value: RoadRoute; expiresAt: number }>();

function isValidCoordinates(coordinates: RouteCoordinates) {
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

function coordinateKey(coordinates: RouteCoordinates) {
  return `${coordinates.lat.toFixed(5)},${coordinates.lon.toFixed(5)}`;
}

function getRoutingBaseUrl() {
  return (process.env.ROUTING_API_BASE_URL || "https://router.project-osrm.org").replace(/\/$/, "");
}

function rememberRoute(cacheKey: string, value: RoadRoute) {
  routeCache.set(cacheKey, { value, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS });
  if (routeCache.size > ROUTE_CACHE_LIMIT) {
    routeCache.delete(routeCache.keys().next().value as string);
  }
  return value;
}

async function getOsrmRoadRoute(
  origin: RouteCoordinates,
  destination: RouteCoordinates,
): Promise<RoadRoute | null> {
  const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const url = `${getRoutingBaseUrl()}/route/v1/driving/${coordinates}?alternatives=false&overview=false&steps=false`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `Shifuh/1.0 (+${SHIFUH_BRAND.siteUrl})`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as OsrmRouteResponse;
    const route = data.code === "Ok" ? data.routes?.[0] : null;
    const distanceMeters = Number(route?.distance);
    const durationSeconds = Number(route?.duration);

    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0
    ) {
      return null;
    }

    return {
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
      provider: "osrm",
    };
  } catch (error) {
    console.error("Erro ao calcular rota viária pelo OSRM:", error);
    return null;
  }
}

export async function getRoadRoute(
  origin: RouteCoordinates,
  destination: RouteCoordinates,
): Promise<RoadRoute | null> {
  if (!isValidCoordinates(origin) || !isValidCoordinates(destination)) return null;

  const preferredProvider = shouldUseGoogleMaps() ? "google" : "osrm";
  const cacheKey = `${preferredProvider}:${coordinateKey(origin)}>${coordinateKey(destination)}`;
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  if (preferredProvider === "google") {
    const googleRoute = await getGoogleDrivingRoute(origin, destination);
    if (googleRoute) {
      return rememberRoute(cacheKey, {
        ...googleRoute,
        provider: "google",
      });
    }

    if (requiresGoogleMaps()) return null;
  }

  const osrmRoute = await getOsrmRoadRoute(origin, destination);
  return osrmRoute ? rememberRoute(cacheKey, osrmRoute) : null;
}
