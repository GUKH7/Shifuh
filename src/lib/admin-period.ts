export type PeriodKey = "today" | "7d" | "30d" | "year" | "all";

export const PERIOD_OPTIONS: Array<{ id: PeriodKey; label: string }> = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "year", label: "Este ano" },
  { id: "all", label: "Todo período" },
];

export function isWithinPeriod(date: string, period: PeriodKey) {
  if (period === "all") return true;

  const target = new Date(date);
  const now = new Date();
  const start = new Date(now);

  if (period === "today") {
    return (
      target.getFullYear() === now.getFullYear() &&
      target.getMonth() === now.getMonth() &&
      target.getDate() === now.getDate()
    );
  }

  if (period === "7d") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return target >= start;
  }

  if (period === "30d") {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return target >= start;
  }

  start.setMonth(0, 1);
  start.setHours(0, 0, 0, 0);
  return target >= start;
}
