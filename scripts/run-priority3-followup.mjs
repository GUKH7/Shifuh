import fs from "node:fs";

const file = "scripts/apply-priority3-followup.mjs";
const lines = fs.readFileSync(file, "utf8").split("\n");

const ariaSourceIndex = lines.findIndex((line) => line.includes("aria-label={\\`Editar produto"));
if (ariaSourceIndex === -1) throw new Error("Rótulo do botão de editar não encontrado.");
lines[ariaSourceIndex] = '                                  aria-label={\\`Editar produto \\${product.name}\\`}';

const assertionIndex = lines.findIndex((line) => line.includes("assert.match(menu, /aria-label="));
if (assertionIndex === -1) throw new Error("Asserção de aria-label não encontrada.");
lines[assertionIndex] = "  assert.match(menu, /aria-label=.*Editar produto/);";

fs.writeFileSync(file, lines.join("\n"));
await import("./apply-priority3-followup.mjs");
