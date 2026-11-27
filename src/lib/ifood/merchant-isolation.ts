import type { createAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;
export const IFOOD_MERCHANT_CONFLICT = "Merchant iFood indisponível para esta loja. Revise o vínculo com o suporte.";

export class IfoodMerchantConflictError extends Error {
  constructor() {
    super(IFOOD_MERCHANT_CONFLICT);
    this.name = "IfoodMerchantConflictError";
  }
}

export function normalizeIfoodMerchantId(value: string) {
  return value.trim().toLowerCase();
}

// The database unique index is the concurrency boundary. This server-side
// check also fails closed on historical conflicts before external I/O.
// Never expose the other restaurant's ID, name or configuration to a tenant.
export async function assertIfoodMerchantBinding(
  admin: AdminClient,
  restaurantId: string,
  merchantId: string,
  mode: "claim" | "bound" = "bound",
  signal?: AbortSignal,
) {
  const merchant = normalizeIfoodMerchantId(merchantId);
  if (!/^[a-z0-9-]+$/.test(merchant)) throw new IfoodMerchantConflictError();
  signal?.throwIfAborted();
  const query = admin.from("ifood_integrations")
    .select("restaurant_id, merchant_id")
    .ilike("merchant_id", merchant)
    .limit(2);
  if (signal) query.abortSignal(signal);
  const { data, error } = await query;
  signal?.throwIfAborted();
  if (error || !data) throw new Error("Não foi possível verificar o vínculo iFood.");
  if (data.some(row => row.restaurant_id !== restaurantId) ||
      (mode === "bound" && data.length !== 1) ||
      data.length > 1) throw new IfoodMerchantConflictError();
}
