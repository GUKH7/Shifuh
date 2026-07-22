import type { IfoodBenefit, IfoodCancellationReason, JsonObject, Order, OrderAddon } from "./types";

export const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendentes" },
  { id: "preparing", label: "Em preparo" },
  { id: "delivering", label: "Em rota" },
  { id: "done", label: "Concluídos" },
  { id: "canceled", label: "Cancelados" },
] as const;

export function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function isToday(dateStr: string) {
  const orderDate = new Date(dateStr);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return orderDate >= start && orderDate < end;
}

export function formatDisplayNumber(order: Pick<Order, "display_number" | "id">) {
  if (order.display_number) {
    return String(order.display_number).padStart(4, "0");
  }
  return order.id.slice(0, 4).toUpperCase();
}

export function playNewOrderChime() {
  if (typeof window === "undefined") return false;

  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return false;

    const audioContext = new AudioContextCtor();
    const now = audioContext.currentTime;
    const notes = [
      { frequency: 880, start: 0, duration: 0.18 },
      { frequency: 1174.66, start: 0.16, duration: 0.22 },
    ];

    notes.forEach((note) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startAt = now + note.start;
      const endAt = startAt + note.duration;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt);
    });

    window.setTimeout(() => {
      void audioContext.close();
    }, 700);

    return true;
  } catch {
    // Some browsers block audio before the first user interaction.
    return false;
  }
}

export function getStatusClasses(status: Order["status"]) {
  switch (status) {
    case "pending":
      return "bg-[#fff4dc] text-[#a56b00]";
    case "preparing":
      return "bg-[#fff2ea] text-[var(--brand)]";
    case "delivering":
      return "bg-[#eef5ff] text-[#2266d2]";
    case "done":
      return "bg-emerald-100 text-emerald-700";
    case "canceled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export function getStatusLabel(status: Order["status"]) {
  switch (status) {
    case "pending":
      return "Confirmado";
    case "preparing":
      return "Em preparo";
    case "delivering":
      return "Em rota";
    case "done":
      return "Concluído";
    case "canceled":
      return "Cancelado";
    default:
      return status;
  }
}

export function getIfoodMeta(order: Order) {
  return order.external_payload?.gestorDelivery || {};
}

export function isIfoodOrder(order: Order) {
  return order.external_source === "ifood" && Boolean(order.external_order_id);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatIfoodOrderType(order: Order) {
  const meta = getIfoodMeta(order);
  const type = String(meta.orderType || "").toUpperCase();
  if (type === "TAKEOUT") return "Retirada";
  if (type === "DELIVERY") return "Entrega";
  return type || "iFood";
}

export function formatIfoodTiming(order: Order) {
  const meta = getIfoodMeta(order);
  const timing = String(meta.orderTiming || "").toUpperCase();
  if (timing === "SCHEDULED") return "Agendado";
  if (timing === "IMMEDIATE") return "Imediato";
  return timing || "Timing não informado";
}

export function listIfoodBenefits(order: Order) {
  const benefits = getIfoodMeta(order).benefits;
  if (!benefits?.items || !Array.isArray(benefits.items)) return [];
  return benefits.items;
}

export function getAddonLabel(addon: OrderAddon) {
  return addon.name || addon.title || addon.description || "Complemento";
}

export function getAddonPrice(addon: OrderAddon) {
  const price = Number(addon.price);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function parseMoneyAmount(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;

  const normalized = value
    .trim()
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

export function calculateCashChange(changeFor: number | string | null | undefined, total: number) {
  const received = parseMoneyAmount(changeFor);
  const normalizedTotal = Number(total);

  if (received === null || !Number.isFinite(normalizedTotal) || received < normalizedTotal) return null;

  return {
    received,
    change: Math.round((received - normalizedTotal) * 100) / 100,
  };
}

export function getIfoodBenefitLabel(benefit: IfoodBenefit) {
  return (
    benefit.target ||
    benefit.description ||
    benefit.sponsorshipValues?.[0]?.name ||
    benefit.campaign?.name ||
    benefit.code ||
    "Beneficio"
  );
}

export function getIfoodBenefitAmount(benefit: IfoodBenefit) {
  return Number(benefit.value || benefit.amount || benefit.sponsorshipValues?.[0]?.value || 0);
}

export function formatIfoodPayment(order: Order) {
  const payment = getIfoodMeta(order).payment || {};
  const parts = [
    payment.methodType || order.payment_method || "não informado",
    payment.methodName,
    payment.cardBrand,
  ].filter(Boolean);

  return parts.join(" / ");
}

export function getIfoodCancellation(order: Order) {
  return getIfoodMeta(order).cancellation || null;
}

export function formatIfoodCancellationStatus(status?: string | null) {
  switch (String(status || "").toLowerCase()) {
    case "requested":
      return "Cancelamento solicitado";
    case "failed":
      return "Cancelamento recusado";
    case "approved":
      return "Cancelamento aprovado";
    case "accepted":
      return "Solicitação aceita";
    default:
      return "Evento de cancelamento";
  }
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

export function normalizeCancellationReasons(response: unknown): IfoodCancellationReason[] {
  const payload = asJsonObject(response);
  const reasons = asJsonObject(payload.reasons);
  const source = Array.isArray(payload.reasons)
    ? payload.reasons
    : Array.isArray(reasons.items)
      ? reasons.items
      : Array.isArray(reasons.reasons)
        ? reasons.reasons
        : Array.isArray(reasons.cancellationReasons)
          ? reasons.cancellationReasons
          : [];

  return source
    .map((rawReason) => {
      const reason = asJsonObject(rawReason);
      const code = String(
        reason.cancellationCode ||
          reason.cancelCodeId ||
          reason.code ||
          reason.id ||
          "",
      ).trim();
      const description = String(
        reason.description ||
          reason.reason ||
          reason.message ||
          reason.name ||
          code,
      ).trim();

      return { code, description };
    })
    .filter((reason: IfoodCancellationReason) => reason.code && reason.description);
}
