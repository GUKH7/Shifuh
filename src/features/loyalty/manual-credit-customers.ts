export type ManualCreditCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const digits = (value: string) => value.replace(/\D/g, "");

export function customerLabel(customer: ManualCreditCustomer): string {
  return customer.name?.trim() || "Cliente sem nome";
}

export function customerInitials(customer: ManualCreditCustomer): string {
  const words = customerLabel(customer).split(/\s+/).filter(Boolean);
  if (!customer.name?.trim()) return "?";
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toLocaleUpperCase("pt-BR");
}

export function formatCustomerPhone(phone: string | null): string {
  if (!phone?.trim()) return "Telefone não informado";
  const raw = digits(phone);
  const local = raw.startsWith("55") && (raw.length === 12 || raw.length === 13) ? raw.slice(2) : raw;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone.trim();
}

export function searchManualCreditCustomers(customers: ManualCreditCustomer[], query: string, limit = 8) {
  const term = normalize(query);
  const numeric = digits(query);
  if (!term) return customers.slice(0, limit);
  return customers
    .filter(customer => normalize(customerLabel(customer)).includes(term) ||
      (numeric.length > 0 && digits(customer.phone || "").includes(numeric)))
    .slice(0, limit);
}

export function recentManualCreditCustomers(customers: ManualCreditCustomer[], recentIds: string[], limit = 5) {
  const byId = new Map(customers.map(c => [c.id, c]));
  return recentIds.slice(0, limit).flatMap(id => {
    const customer = byId.get(id);
    return customer ? [customer] : [];
  });
}

export function rememberManualCreditCustomer(previous: string[], customerId: string, limit = 5): string[] {
  return [customerId, ...previous.filter(id => id !== customerId)].slice(0, limit);
}
