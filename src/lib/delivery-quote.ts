import { calculateDeliveryFee, getCoordinates, type GeocodingAddress } from "@/lib/geo";
import {
  geocodeAddressWithGoogle,
  requiresGoogleMaps,
  shouldUseGoogleMaps,
} from "@/lib/google-maps";
import { getRoadRoute } from "@/lib/routing";

export type DeliveryQuoteErrorCode =
  | "STORE_LOCATION_UNAVAILABLE"
  | "ADDRESS_NOT_FOUND"
  | "ROUTING_UNAVAILABLE"
  | "OUTSIDE_DELIVERY_AREA";

export class DeliveryQuoteError extends Error {
  code: DeliveryQuoteErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: DeliveryQuoteErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DeliveryQuoteError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DeliveryQuoteRestaurant = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  address_zip?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  delivery_tiers?: unknown;
};

export type DeliveryQuoteAddress = {
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export type DeliveryQuote = {
  price: number;
  time: number;
  distance: number;
  routeDurationMinutes: number;
  valid: true;
  addressValidated: true;
  distanceMethod: "google_route" | "osrm_route";
  routeProvider: "google" | "osrm";
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function hasValidStoredCoordinates(restaurant: DeliveryQuoteRestaurant) {
  const latitude = Number(restaurant.latitude);
  const longitude = Number(restaurant.longitude);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

function toGeocodingAddress(address: DeliveryQuoteAddress): GeocodingAddress {
  return {
    postalCode: address.cep,
    street: address.street,
    number: address.number === "S/N" ? undefined : address.number,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
  };
}

function getRestaurantAddress(restaurant: DeliveryQuoteRestaurant): GeocodingAddress {
  return {
    postalCode: restaurant.address_zip || undefined,
    street: restaurant.address_street || undefined,
    number: restaurant.address_number || undefined,
    neighborhood: restaurant.address_neighborhood || undefined,
    city: restaurant.address_city || undefined,
    state: restaurant.address_state || undefined,
  };
}

async function resolveCoordinates(
  address: GeocodingAddress,
  storedCoordinates?: { lat: number; lon: number } | null,
) {
  if (shouldUseGoogleMaps()) {
    const googleCoordinates = await geocodeAddressWithGoogle(address);
    if (googleCoordinates) return googleCoordinates;
    if (requiresGoogleMaps()) return null;
  }

  if (storedCoordinates) return storedCoordinates;
  return getCoordinates(address);
}

export async function calculateDeliveryQuote(
  restaurant: DeliveryQuoteRestaurant,
  address: DeliveryQuoteAddress,
): Promise<DeliveryQuote> {
  const storedRestaurantCoordinates = hasValidStoredCoordinates(restaurant)
    ? { lat: Number(restaurant.latitude), lon: Number(restaurant.longitude) }
    : null;

  const restaurantAddress = getRestaurantAddress(restaurant);
  const restaurantCoordinates = restaurantAddress.street && restaurantAddress.city && restaurantAddress.state
    ? await resolveCoordinates(restaurantAddress, storedRestaurantCoordinates)
    : storedRestaurantCoordinates;

  if (!restaurantCoordinates) {
    throw new DeliveryQuoteError(
      "STORE_LOCATION_UNAVAILABLE",
      "A loja não conseguiu localizar o ponto de saída da entrega.",
      503,
    );
  }

  const customerCoordinates = await resolveCoordinates(toGeocodingAddress(address));
  if (!customerCoordinates) {
    throw new DeliveryQuoteError(
      "ADDRESS_NOT_FOUND",
      "Não foi possível localizar o endereço informado.",
      422,
    );
  }

  const route = await getRoadRoute(restaurantCoordinates, customerCoordinates);
  if (!route) {
    throw new DeliveryQuoteError(
      "ROUTING_UNAVAILABLE",
      "Não foi possível calcular a rota de entrega agora. Tente novamente.",
      503,
    );
  }

  const tiers = Array.isArray(restaurant.delivery_tiers) ? restaurant.delivery_tiers : [];
  const fee = calculateDeliveryFee(route.distanceKm, tiers);

  if (!fee.valid && tiers.length > 0) {
    throw new DeliveryQuoteError(
      "OUTSIDE_DELIVERY_AREA",
      "O endereço informado está fora da área de entrega.",
      422,
      { distance: route.distanceKm },
    );
  }

  return {
    price: roundMoney(fee.price),
    time: Math.max(0, Number(fee.time) || 0),
    distance: route.distanceKm,
    routeDurationMinutes: route.durationMinutes,
    valid: true,
    addressValidated: true,
    distanceMethod: route.provider === "google" ? "google_route" : "osrm_route",
    routeProvider: route.provider,
  };
}
