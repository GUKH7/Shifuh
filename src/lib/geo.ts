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

export async function getCoordinates(address: string) {
  const postalCode = extractPostalCode(address);
  const attempts = buildAddressAttempts(address);

  if (postalCode) {
    try {
      const postalUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&postalcode=${postalCode}&limit=1`;
      const postalRes = await fetch(postalUrl, {
        headers: {
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });

      if (postalRes.ok) {
        const postalData = await postalRes.json();
        if (postalData && postalData.length > 0) {
          return {
            lat: parseFloat(postalData[0].lat),
            lon: parseFloat(postalData[0].lon),
          };
        }
      }
    } catch (error) {
      console.error("Erro GPS CEP:", error);
    }
  }

  for (const attempt of attempts) {
    try {
      const query = encodeURIComponent(attempt);
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&addressdetails=1&limit=1&q=${query}`;
      const res = await fetch(url, {
        headers: {
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });

      if (!res.ok) continue;

      const data = await res.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
        };
      }
    } catch (error) {
      console.error("Erro GPS:", error);
    }
  }

  return null;
}
