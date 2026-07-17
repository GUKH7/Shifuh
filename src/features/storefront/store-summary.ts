type WorkHour = {
  day_id?: number;
  is_open?: boolean;
  open_time?: string;
  close_time?: string;
};

type DeliveryTier = {
  time?: number | string;
};

type RestaurantAddress = {
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
};

export type StoreStatus = {
  tone: "open" | "closing" | "closed";
  label: string;
};

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const CLOSING_SOON_MINUTES = 30;

function timeToMinutes(value?: string) {
  if (!value || !/^\d{1,2}:\d{2}/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getZonedDayAndMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dayIds: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dayId: dayIds[values.weekday] ?? 0,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function getOpenWindow(workHours: WorkHour[], dayId: number, minutes: number) {
  const today = workHours.find((day) => Number(day.day_id) === dayId && day.is_open !== false);
  const previousDayId = (dayId + 6) % 7;
  const previous = workHours.find(
    (day) => Number(day.day_id) === previousDayId && day.is_open !== false,
  );

  const candidates = [
    today && {
      start: timeToMinutes(today.open_time),
      end: timeToMinutes(today.close_time),
      current: minutes,
    },
    previous && {
      start: timeToMinutes(previous.open_time),
      end: timeToMinutes(previous.close_time),
      current: minutes + 24 * 60,
    },
  ];

  for (const candidate of candidates) {
    if (!candidate || candidate.start === null || candidate.end === null) continue;
    const end = candidate.end <= candidate.start ? candidate.end + 24 * 60 : candidate.end;
    if (candidate.current >= candidate.start && candidate.current < end) {
      return { minutesUntilClose: end - candidate.current };
    }
  }

  return null;
}

export function getStoreStatus(rawWorkHours: unknown, now = new Date()): StoreStatus {
  const workHours = Array.isArray(rawWorkHours) ? (rawWorkHours as WorkHour[]) : [];
  if (workHours.length === 0) return { tone: "open", label: "Aberto" };

  const { dayId, minutes } = getZonedDayAndMinutes(now);
  const openWindow = getOpenWindow(workHours, dayId, minutes);

  if (!openWindow) return { tone: "closed", label: "Fechado" };
  if (openWindow.minutesUntilClose <= CLOSING_SOON_MINUTES) {
    return { tone: "closing", label: "Fechando em breve" };
  }
  return { tone: "open", label: "Aberto" };
}

export function formatDeliveryEstimate(rawTiers: unknown) {
  const tiers = Array.isArray(rawTiers) ? (rawTiers as DeliveryTier[]) : [];
  const times = tiers
    .map((tier) => Number(tier.time))
    .filter((time) => Number.isFinite(time) && time > 0);

  if (times.length === 0) return "Tempo a confirmar";
  const minimum = Math.min(...times);
  const maximum = Math.max(...times);
  return minimum === maximum ? `${minimum} min` : `${minimum}-${maximum} min`;
}

export function formatServiceRegion(restaurant: RestaurantAddress) {
  const cityAndState = [restaurant.address_city, restaurant.address_state]
    .filter(Boolean)
    .join(" - ");
  return [restaurant.address_neighborhood, cityAndState].filter(Boolean).join(", ") || "Consulte a região de entrega";
}
