export type LoyaltyPromotionConfig = {
  name?: string | null;
  earning_mode?: "spend" | "order" | string | null;
  spend_amount?: number | string | null;
  points_per_spend?: number | string | null;
  points_per_order?: number | string | null;
  minimum_order_amount?: number | string | null;
};

export type WheelPromotionRule = {
  rule_type?: string | null;
  enabled?: boolean | null;
  threshold_amount?: number | string | null;
  threshold_count?: number | string | null;
  weekdays?: number[] | null;
  start_time?: string | null;
  end_time?: string | null;
  max_spins?: number | string | null;
  limit_period?: string | null;
};

export type StorefrontPromotionSummaryItem = {
  kind: "loyalty" | "wheel";
  title: string;
  message: string;
  detail?: string | null;
};

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function positiveInteger(value: unknown) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function formatPromotionMoney(value: unknown) {
  const amount = positiveNumber(value);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(amount)
    .replace(/\u00a0/g, " ");
}

function pointLabel(points: number) {
  return points === 1 ? "ponto" : "pontos";
}

function orderLabel(count: number) {
  return count === 1 ? "pedido" : "pedidos";
}

function spinLabel(count: number) {
  return count === 1 ? "giro" : "giros";
}

function joinAlternatives(items: string[]) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} ou ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ou ${items.at(-1)}`;
}

function formatClock(value: string | null | undefined) {
  const raw = String(value || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(raw)) return "";
  const [hours, minutes] = raw.split(":");
  return minutes === "00" ? `${Number(hours)}h` : `${Number(hours)}h${minutes}`;
}

function formatWeekdays(weekdays: number[] | null | undefined) {
  const unique = [...new Set((weekdays || []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);
  const key = unique.join(",");
  if (key === "0,1,2,3,4,5,6") return "";
  if (key === "1,2,3,4,5") return "de seg a sex";
  if (key === "0,6") return "aos sábados e domingos";

  const labels = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const selected = unique.map((day) => labels[day]);
  if (!selected.length) return "";
  return `em ${joinAlternatives(selected)}`;
}

function formatWheelGuards(rules: WheelPromotionRule[]) {
  const details: string[] = [];
  const schedule = rules.find((rule) => rule.enabled !== false && rule.rule_type === "schedule");
  if (schedule) {
    const weekdays = formatWeekdays(schedule.weekdays);
    const start = formatClock(schedule.start_time);
    const end = formatClock(schedule.end_time);
    const dayPart = weekdays ? `${weekdays}${start && end ? ", " : ""}` : "";
    const timePart = start && end ? `das ${start} às ${end}` : "";
    const scheduleText = `${dayPart}${timePart}`.trim();
    if (scheduleText) details.push(`Válido ${scheduleText}.`);
  }

  const customerLimit = rules.find(
    (rule) => rule.enabled !== false && rule.rule_type === "customer_spin_limit",
  );
  if (customerLimit) {
    const maxSpins = positiveInteger(customerLimit.max_spins);
    if (maxSpins > 0) {
      const periodLabel = customerLimit.limit_period === "day"
        ? "por dia"
        : customerLimit.limit_period === "week"
          ? "por semana"
          : "durante a campanha";
      details.push(`Até ${maxSpins} ${spinLabel(maxSpins)} ${periodLabel}.`);
    }
  }

  return details.join(" ") || null;
}

export function buildLoyaltyPromotionSummary(
  program: LoyaltyPromotionConfig | null | undefined,
): StorefrontPromotionSummaryItem | null {
  if (!program) return null;

  const minimumOrder = positiveNumber(program.minimum_order_amount);
  let message = "";

  if (program.earning_mode === "order") {
    const points = positiveInteger(program.points_per_order);
    if (!points) return null;
    message = `Ganhe ${points} ${pointLabel(points)} a cada pedido concluído.`;
  } else if (program.earning_mode === "spend") {
    const spendAmount = positiveNumber(program.spend_amount);
    const points = positiveInteger(program.points_per_spend);
    if (!spendAmount || !points) return null;
    const spendingLabel = spendAmount === 1
      ? `${formatPromotionMoney(spendAmount)} gasto`
      : `${formatPromotionMoney(spendAmount)} em compras`;
    message = `Ganhe ${points} ${pointLabel(points)} a cada ${spendingLabel}.`;
  } else {
    return null;
  }

  return {
    kind: "loyalty",
    title: String(program.name || "Fidelidade").trim() || "Fidelidade",
    message,
    detail: minimumOrder > 0
      ? `Pedidos a partir de ${formatPromotionMoney(minimumOrder)} acumulam pontos.`
      : "Acumule pontos nesta loja e troque por recompensas.",
  };
}

function singleWheelUnlockMessage(rule: WheelPromotionRule) {
  if (rule.rule_type === "completed_order") {
    return "Faça um pedido e ganhe uma chance de girar.";
  }
  if (rule.rule_type === "minimum_order") {
    const amount = positiveNumber(rule.threshold_amount);
    return amount > 0 ? `Pedidos a partir de ${formatPromotionMoney(amount)} liberam um giro.` : null;
  }
  if (rule.rule_type === "every_orders") {
    const count = positiveInteger(rule.threshold_count);
    return count > 0
      ? `A cada ${count} ${orderLabel(count)}, você ganha uma chance na Roleta.`
      : null;
  }
  if (rule.rule_type === "spend_threshold") {
    const amount = positiveNumber(rule.threshold_amount);
    return amount > 0
      ? `A cada ${formatPromotionMoney(amount)} acumulados em pedidos, você ganha uma chance na Roleta.`
      : null;
  }
  if (rule.rule_type === "first_purchase") {
    return "Sua primeira compra libera um giro na Roleta.";
  }
  return null;
}

function wheelUnlockLabel(rule: WheelPromotionRule) {
  if (rule.rule_type === "completed_order") return "pedido concluído";
  if (rule.rule_type === "minimum_order") {
    const amount = positiveNumber(rule.threshold_amount);
    return amount > 0 ? `pedido a partir de ${formatPromotionMoney(amount)}` : null;
  }
  if (rule.rule_type === "every_orders") {
    const count = positiveInteger(rule.threshold_count);
    return count > 0 ? `cada ${count} ${orderLabel(count)} concluídos` : null;
  }
  if (rule.rule_type === "spend_threshold") {
    const amount = positiveNumber(rule.threshold_amount);
    return amount > 0 ? `cada ${formatPromotionMoney(amount)} acumulados em pedidos` : null;
  }
  if (rule.rule_type === "first_purchase") return "primeira compra";
  return null;
}

export function buildWheelPromotionSummary(
  campaignName: string | null | undefined,
  rules: WheelPromotionRule[] | null | undefined,
): StorefrontPromotionSummaryItem | null {
  const enabledRules = (rules || []).filter((rule) => rule.enabled !== false);
  const unlockRules = enabledRules.filter((rule) =>
    ["completed_order", "minimum_order", "every_orders", "spend_threshold", "first_purchase"].includes(
      String(rule.rule_type || ""),
    ),
  );
  if (!unlockRules.length) return null;

  let message: string;
  if (unlockRules.length === 1) {
    message = singleWheelUnlockMessage(unlockRules[0]) || "Participe da Roleta da Sorte nesta loja.";
  } else {
    const labels = unlockRules.map(wheelUnlockLabel).filter((label): label is string => Boolean(label));
    if (!labels.length) return null;
    message = `A Roleta libera um giro por ${joinAlternatives(labels)}.`;
  }

  return {
    kind: "wheel",
    title: String(campaignName || "Roleta da Sorte").trim() || "Roleta da Sorte",
    message,
    detail: formatWheelGuards(enabledRules),
  };
}
