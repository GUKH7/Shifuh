export type SectionId = "identity" | "operations" | "catalog" | "payments";
export type SectionStatus = "complete" | "incomplete";
export type ReadinessStep = {
  id: SectionId; title: string; description: string; href: string;
  status: SectionStatus; issues: string[];
};
export type OnboardingReadiness = {
  steps: ReadinessStep[]; completeCount: number; totalCount: number;
  percent: number; readyForReview: boolean; publicSlug: string | null;
};
type Row = Record<string, unknown>;
export type ReadinessInput = { restaurant: Row; categories: Row[]; products: Row[]; };

const SUPPORTED_PAYMENTS = new Set(["pix", "credit", "debit", "cash"]);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const present = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
const nonNegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const digits = (value: unknown) => typeof value === "string" ? value.replace(/\D/g, "") : "";
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((v): v is Row => !!v && typeof v === "object" && !Array.isArray(v)) : [];

function scheduleConfigured(value: unknown): boolean {
  return rows(value).some(day =>
    day.is_open === true &&
    TIME.test(String(day.open_time || "")) &&
    TIME.test(String(day.close_time || "")) && day.open_time !== day.close_time
  );
}

function hasDeliveryRule(value: unknown): boolean {
  return rows(value).some(tier => tier.mode === "per_km"
    ? positive(tier.max_distance) && nonNegative(tier.price_per_km)
    : positive(tier.distance) && nonNegative(tier.price));
}
function addressConfigured(restaurant: Row): boolean {
  return present(restaurant.address_street) && present(restaurant.address_number) &&
    present(restaurant.address_city) && present(restaurant.address_state);
}
function buildStep(id: SectionId, title: string, description: string, href: string, issues: string[]): ReadinessStep {
  return {id,title,description,href, status: issues.length ? "incomplete" : "complete",issues};
}

// Derived, read-only state. No step records or external provider calls.
// "Ready" never implies owner confirmation or a private/unpublished storefront.
export function evaluateOnboardingReadiness(input: ReadinessInput): OnboardingReadiness {
  const restaurant = input.restaurant;
  const identity: string[] = [];
  if (!present(restaurant.name)) identity.push("Informe o nome do restaurante.");
  if (!present(restaurant.slug)) identity.push("Defina o link público da loja.");
  const phone = digits(restaurant.phone || restaurant.whatsapp_number);
  if (![10,11].includes(phone.length)) identity.push("Confira o telefone com DDD.");

  const operations: string[] = [];
  if (!scheduleConfigured(restaurant.work_hours)) operations.push("Revise os horários de funcionamento.");
  const pickup = restaurant.pickup_enabled === true;
  const delivery = hasDeliveryRule(restaurant.delivery_tiers);
  if (!pickup && !delivery) operations.push("Configure entrega ou habilite retirada.");
  if (delivery && !addressConfigured(restaurant)) operations.push("Complete o endereço da loja para entregas.");

  const activeCategories = new Set(input.categories
    .filter(category => category.is_active !== false && present(category.name) && present(category.id))
    .map(category => category.id));
  const hasProduct = input.products.some(product =>
    product.is_active !== false && activeCategories.has(product.category_id) &&
    present(product.name) && nonNegative(product.price));
  const catalog = hasProduct ? [] : ["Crie uma categoria ativa com pelo menos um produto disponível e preço válido."];

  // Null or absent payment preferences must not silently count default UI methods as configured.
  const configuredPayments = Array.isArray(restaurant.accepted_payment_methods)
    ? restaurant.accepted_payment_methods.filter(value =>
        typeof value === "string" && SUPPORTED_PAYMENTS.has(value))
    : [];
  const payments = configuredPayments.length ? [] : ["Confira e salve pelo menos uma forma de pagamento."];

  const steps = [
    buildStep("identity", "Minha loja", "Nome, link e telefone de contato.", "/admin/settings?setup=identity", identity),
    buildStep("operations", "Atendimento", "Horários e entrega ou retirada.", operations.some(issue => issue.includes("horários")) ? "/admin/settings?setup=hours" : "/admin/settings?setup=delivery", operations),
    buildStep("catalog", "Cardápio", "Uma categoria ativa e um produto disponível.", "/admin/menu", catalog),
    buildStep("payments", "Pagamentos", "Meios aceitos diretamente pela loja.", "/admin/settings/payments", payments)
  ];
  const completeCount=steps.filter(step=>step.status==="complete").length;
  return {
    steps,completeCount,totalCount:steps.length,percent:Math.round(completeCount/steps.length*100),
    readyForReview:completeCount===steps.length,
    publicSlug:present(restaurant.slug)?restaurant.slug.trim():null
  };
}
