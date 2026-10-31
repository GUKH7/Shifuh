export type CreditMode = "spend" | "points";
export type EarningConfig = {
  status: "draft" | "active" | "paused";
  earning_mode: "spend" | "order";
  spend_amount: number | null;
  points_per_spend: number | null;
  points_per_order: number | null;
  minimum_order_amount: number;
};

export function calculateManualPoints(mode: CreditMode, input: string, program: EarningConfig): number {
  if (program.status !== "active") throw new Error("Ative o programa de fidelidade antes de lançar pontos.");
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um valor numérico válido.");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) throw new Error("O valor deve ser maior que zero.");
  if (mode === "points") {
    if (!Number.isSafeInteger(value) || value > 10000) throw new Error("Informe de 1 a 10.000 pontos inteiros.");
    return value;
  }
  if (value < program.minimum_order_amount) throw new Error("A compra não alcança o valor mínimo do programa.");
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents > 100000000) throw new Error("Valor da compra fora do limite permitido.");
  if (program.earning_mode === "order") {
    if (!Number.isSafeInteger(program.points_per_order) || (program.points_per_order ?? 0) <= 0) throw new Error("Configuração de pontos por pedido inválida.");
    return program.points_per_order!;
  }
  const spendCents = Math.round((program.spend_amount ?? 0) * 100);
  const factor = program.points_per_spend ?? 0;
  if (!Number.isSafeInteger(spendCents) || spendCents <= 0 || !Number.isSafeInteger(factor) || factor <= 0) throw new Error("Configuração de pontos por valor inválida.");
  const points = Math.floor(cents / spendCents) * factor;
  if (!Number.isSafeInteger(points) || points <= 0 || points > 10000) throw new Error("Quantidade de pontos fora do limite permitido.");
  return points;
}

export function validateManualCredit(input: { customerId: string; reason: string; requestId: string; points: number }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.customerId)) throw new Error("Cliente inválido.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error("Identificador da operação inválido.");
  if (input.reason.trim().length < 5 || input.reason.trim().length > 200) throw new Error("Informe um motivo de 5 a 200 caracteres.");
  if (!Number.isSafeInteger(input.points) || input.points < 1 || input.points > 10000) throw new Error("Crédito inválido.");
  return { ...input, reason: input.reason.trim() };
}
