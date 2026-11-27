// Server-side only. Defaults preserve the existing test integration until an explicitly approved cutover.
export function isIfoodOrdersOnly() {
  return process.env.IFOOD_ORDERS_ONLY === "true";
}
export function isIfoodCutoverPaused() {
  return process.env.IFOOD_CUTOVER_PAUSED === "true";
}
export function assertIfoodOrdersAvailable() {
  if (isIfoodCutoverPaused()) throw new Error("Integração iFood temporariamente suspensa para manutenção.");
}
export function assertIfoodModuleAvailable() {
  assertIfoodOrdersAvailable();
  if (isIfoodOrdersOnly()) throw new Error("Módulo iFood não habilitado. Apenas Order e Events estão autorizados.");
}
