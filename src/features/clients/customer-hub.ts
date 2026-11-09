export type CustomerRecord = { id: string; name: string | null; phone: string | null; created_at: string | null };
export type PurchaseRecord = {
  id: string;
  customer_phone: string | null;
  customer_name: string | null;
  total: number | null;
  created_at: string | null;
  status: string | null;
  display_number: number | null;
  payment_method: string | null;
  is_test: boolean | null;
  address?: Record<string, string | null | undefined> | null;
};
export type AccountRecord = { customer_id: string; points_balance: number; lifetime_earned: number };
export type TransactionRecord = {
  id: string;
  customer_id: string;
  points_delta: number;
  transaction_type: string;
  description: string | null;
  created_at: string | null;
};
export type CustomerOrder = {
  id: string; displayNumber: number | null; total: number;
  status: string; paymentMethod: string | null; createdAt: string;
};
export type CustomerTransaction = {
  id: string; points: number; description: string | null;
  type: string; createdAt: string;
};
export type CustomerProfile = {
  key: string; id: string | null; phone: string; name: string;
  registered: boolean; createdAt: string | null;
  orderCount: number; totalSpent: number; lastOrderDate: string | null;
  addresses: string[];
  recentOrders: CustomerOrder[];
  pointsBalance: number; lifetimeEarned: number;
  recentTransactions: CustomerTransaction[];
};
export type CustomerSegment = "active" | "inactive" | "never" | "unknown";

export function normalizeCustomerPhone(value: string | null | undefined): string {
  const raw = (value || "").replace(/\D/g, "");
  const local = raw.startsWith("55") && (raw.length === 12 || raw.length === 13) ? raw.slice(2) : raw;
  return local.length === 10 || local.length === 11 ? local : "";
}

export function segmentCustomer(profile: Pick<CustomerProfile, "lastOrderDate">, historyComplete = true, now = Date.now()): CustomerSegment {
  if (!profile.lastOrderDate) return historyComplete ? "never" : "unknown";
  const last = Date.parse(profile.lastOrderDate);
  if (!Number.isFinite(last)) return "unknown";
  return Math.max(0, now - last) >= 30 * 24 * 60 * 60 * 1000 ? "inactive" : "active";
}

export function formatClientAddress(address: PurchaseRecord["address"]): string | null {
  if (!address || typeof address.street !== "string" || !address.street.trim()) return null;
  const street = address.street.trim() + ", " + (address.number || "S/N");
  const district = address.neighborhood || "Bairro não informado";
  const city = [address.city, address.state].filter(Boolean).join("/");
  return street + " - " + district +
    (city ? " - " + city : "") +
    (address.complement ? " · " + address.complement : "") +
    (address.cep ? " · CEP " + address.cep : "");
}

export function buildCustomerProfiles(
  customers: CustomerRecord[],
  orders: PurchaseRecord[],
  accounts: AccountRecord[],
  transactions: TransactionRecord[],
): CustomerProfile[] {
  const result = new Map<string, CustomerProfile>();
  const byCustomerId = new Map<string, CustomerProfile>();
  const empty = (phone: string): CustomerProfile => ({
    key: phone, id: null, phone, name: "Cliente", registered: false, createdAt: null,
    orderCount: 0, totalSpent: 0, lastOrderDate: null,
    addresses: [], recentOrders: [], pointsBalance: 0, lifetimeEarned: 0, recentTransactions: [],
  });

  for (const row of customers) {
    const phone = normalizeCustomerPhone(row.phone);
    if (!phone) continue;
    let profile = result.get(phone);
    if (!profile) {
      profile = empty(phone);
      result.set(phone, profile);
    }
    profile.registered = true;
    if (!profile.id) profile.id = row.id;
    if (row.name?.trim()) profile.name = row.name.trim();
    if (row.created_at && (!profile.createdAt || row.created_at < profile.createdAt)) profile.createdAt = row.created_at;
    byCustomerId.set(row.id, profile);
  }

  // Orders contain a phone instead of a customer foreign key; match local and +55 versions.
  // Never group records with a missing/invalid phone together.
  const ordered = [...orders].filter(row => row.created_at).sort((a, b) =>
    Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
  for (const order of ordered) {
    if (order.is_test || order.status === "canceled") continue;
    const phone = normalizeCustomerPhone(order.customer_phone);
    if (!phone) continue;
    let profile = result.get(phone);
    if (!profile) {
      profile = empty(phone);
      result.set(phone, profile);
    }
    if (profile.name === "Cliente" && order.customer_name?.trim()) profile.name = order.customer_name.trim();
    const address = formatClientAddress(order.address);
    if (address && !profile.addresses.includes(address)) profile.addresses.push(address);
    if (profile.recentOrders.length < 5) {
      profile.recentOrders.push({
        id: order.id, displayNumber: order.display_number, total: Number(order.total) || 0,
        status: order.status || "pending", paymentMethod: order.payment_method,
        createdAt: order.created_at!,
      });
    }
    // Only completed, non-test orders are purchases. Open orders are shown in history,
    // not counted as revenue or recency (avoids false "active" classifications).
    if (order.status !== "done") continue;
    profile.orderCount += 1;
    profile.totalSpent += Number(order.total) || 0;
    if (!profile.lastOrderDate || order.created_at! > profile.lastOrderDate) profile.lastOrderDate = order.created_at;
  }

  for (const account of accounts) {
    const profile = byCustomerId.get(account.customer_id);
    if (!profile) continue;
    profile.pointsBalance += Number(account.points_balance) || 0;
    profile.lifetimeEarned += Number(account.lifetime_earned) || 0;
  }

  const orderedTransactions = [...transactions].filter(row => row.created_at)
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
  for (const tx of orderedTransactions) {
    const profile = byCustomerId.get(tx.customer_id);
    if (!profile || profile.recentTransactions.length >= 5) continue;
    profile.recentTransactions.push({
      id: tx.id, points: Number(tx.points_delta) || 0, description: tx.description,
      type: tx.transaction_type, createdAt: tx.created_at!,
    });
  }
  return Array.from(result.values());
}
