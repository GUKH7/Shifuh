import { createHmac, timingSafeEqual } from "node:crypto";

function getTrackingSecret() {
  const secret = process.env.ORDER_TRACKING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || secret.length < 32) {
    throw new Error("ORDER_TRACKING_SECRET is not configured.");
  }

  return secret;
}

export function createOrderTrackingToken(orderId: string) {
  return createHmac("sha256", getTrackingSecret()).update(orderId).digest("base64url");
}

export function verifyOrderTrackingToken(orderId: string, token: string) {
  if (!orderId || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;

  const expected = Buffer.from(createOrderTrackingToken(orderId));
  const received = Buffer.from(token);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
