import fs from "node:fs";

if (fs.existsSync("src/components/ui/admin-page-states.tsx")) {
  console.log("Prioridade 2 já aplicada; seguindo para validação.");
} else {
  await import("./apply-priority2.mjs");
}
