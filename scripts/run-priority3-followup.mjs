import fs from "node:fs";

const file = "scripts/apply-priority3-followup.mjs";
const lines = fs.readFileSync(file, "utf8").split("\n");
const index = lines.findIndex((line) => line.includes("assert.match(menu, /aria-label="));
if (index === -1) throw new Error("Asserção de aria-label não encontrada.");
lines[index] = "  assert.match(menu, /aria-label=.*Editar produto/);";
fs.writeFileSync(file, lines.join("\n"));
await import("./apply-priority3-followup.mjs");
