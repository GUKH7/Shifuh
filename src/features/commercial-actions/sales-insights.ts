import type { CommercialAction } from "./rules";

export type SalesOrder = {
  id: string;
  created_at: string;
  status: string | null;
  is_test: boolean | null;
  total: number | string | null;
};

export type PeriodSales = {
  completed: number;
  canceled: number;
  revenue: number;
  averageTicket: number;
  canceledPercent: number;
};

export type SalesInsights = {
  coverage: "complete" | "incomplete";
  current: PeriodSales | null;
  previous: PeriodSales | null;
  completedChangePercent: number | null;
  actions: CommercialAction[];
};

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const money = (value: number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(value);

// Pure, aggregate-only recommendations. Order/customer identifiers never leave this function.
export function getSalesInsights(orders: SalesOrder[], nowMs: number, complete = true): SalesInsights {
  if (!Number.isFinite(nowMs)) throw new Error("Invalid analysis date.");
  const cutoff = nowMs - 2 * THIRTY_DAYS;
  const split = nowMs - THIRTY_DAYS;
  let missingTotals = false;
  const windows = [
    {completed: 0, canceled: 0, revenueCents: 0},
    {completed: 0, canceled: 0, revenueCents: 0},
  ];
  for (const order of orders) {
    const timestamp = Date.parse(order.created_at);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > nowMs) continue;
    if (order.is_test === true || (order.status !== "done" && order.status !== "canceled")) continue;
    const target = windows[timestamp >= split ? 0 : 1];
    if (order.status === "canceled") { target.canceled++; continue; }
    target.completed++;
    const amount = order.total == null ? NaN : Number(order.total);
    if (!Number.isFinite(amount) || amount < 0) { missingTotals = true; continue; }
    target.revenueCents += Math.round(amount * 100);
  }
  if (!complete || missingTotals) {
    return {
      coverage: "incomplete", current: null, previous: null, completedChangePercent: null,
      actions: [{
        id: "sales-coverage",
        title: "Confira o histórico completo de pedidos",
        description: "Os dados disponíveis não permitem calcular comparações confiáveis para os últimos 60 dias. Nenhuma conclusão de vendas foi gerada.",
        href: "/admin/orders", priority: "medium", cta: "Ver pedidos",
      }],
    };
  }
  const summary = (window: typeof windows[number]): PeriodSales => {
    const decided = window.completed + window.canceled;
    const revenue = window.revenueCents / 100;
    return {
      completed: window.completed, canceled: window.canceled, revenue,
      averageTicket: window.completed ? revenue / window.completed : 0,
      canceledPercent: decided ? Math.round(100 * window.canceled / decided) : 0,
    };
  };
  const current = summary(windows[0]);
  const previous = summary(windows[1]);
  const completedChange = previous.completed > 0
    ? 100 * (current.completed - previous.completed) / previous.completed : null;
  // Round gains and declines symmetrically (JS Math.round(-62.5) would otherwise yield -62).
  const completedChangePercent = completedChange === null ? null
    : Math.sign(completedChange) * Math.round(Math.abs(completedChange));
  const actions: CommercialAction[] = [];
  if (current.completed === 0 && previous.completed === 0) {
    actions.push({
      id: "first-sales", title: "Conquiste seus primeiros pedidos",
      description: "Não encontramos pedidos concluídos nos últimos 60 dias. Confira sua vitrine e planeje a divulgação antes de criar promoções.",
      href: "/admin/promotions", priority: "medium", cta: "Planejar divulgação",
    });
  } else if (current.completed === 0 && previous.completed > 0) {
    actions.push({
      id: "sales-stalled", title: "Retome os pedidos do restaurante",
      description: "Nenhum pedido concluído nos últimos 30 dias, contra " + previous.completed + " no período anterior. Revise os canais de venda e as campanhas.",
      href: "/admin/promotions", priority: "high", cta: "Revisar campanhas",
    });
  } else if (previous.completed >= 8 && completedChangePercent !== null && completedChangePercent <= -25) {
    actions.push({
      id: "sales-decline", title: "Investigue a queda de pedidos",
      description: current.completed + " pedidos concluídos nos últimos 30 dias, contra " + previous.completed + " antes (" + completedChangePercent + "%). Consulte seus clientes e teste ações de recompra.",
      href: "/admin/clients", priority: "high", cta: "Ver clientes",
    });
  }
  const concluded = current.completed + current.canceled;
  if (concluded >= 10 && current.canceled >= 3 && current.canceledPercent >= 20) {
    actions.push({
      id: "cancellations", title: "Revise os pedidos cancelados",
      description: current.canceled + " de " + concluded + " pedidos encerrados nos últimos 30 dias foram cancelados (" + current.canceledPercent + "%). Verifique as causas antes de ampliar as ofertas.",
      href: "/admin/orders", priority: "medium", cta: "Ver pedidos",
    });
  }
  if (current.completed >= 5 && previous.completed >= 5 &&
      previous.averageTicket > 0 && current.averageTicket <= previous.averageTicket * 0.8) {
    actions.push({
      id: "ticket-decline", title: "Revise o valor médio dos pedidos",
      description: "O ticket médio dos pedidos concluídos caiu de " + money(previous.averageTicket) + " para " + money(current.averageTicket) + " em relação aos 30 dias anteriores. Confira combos e complementos.",
      href: "/admin/menu", priority: "medium", cta: "Revisar cardápio",
    });
  }
  return {coverage: "complete", current, previous, completedChangePercent, actions};
}
