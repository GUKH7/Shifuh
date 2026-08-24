export const SHIFUH_BRAND = {
  name: "Shifuh",
  uppercaseName: "SHIFUH",
  siteUrl: "https://www.shifuh.com.br",
  description: "Plataforma de gestão, vitrine digital e pedidos para restaurantes.",
  iconPath: "/brand/shifuh-icon.svg",
} as const;

export function buildShifuhUrl(path = "/") {
  return new URL(path, SHIFUH_BRAND.siteUrl).toString();
}
