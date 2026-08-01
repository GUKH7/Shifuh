const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const SOURCE_ROOTS = ["src/app", "src/components", "src/features"];
const SOURCE_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function collectRadiusUsage() {
  const usage = new Map();
  const files = SOURCE_ROOTS.flatMap(walk).filter((file) =>
    SOURCE_EXTENSIONS.has(path.extname(file)),
  );

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const matches = content.match(/\b(?:[a-z0-9-]+:)*rounded(?:-[^\s"'`{}<>]+)?/g) || [];

    for (const token of matches) {
      const normalized = token.replace(/[),;]+$/, "");
      const current = usage.get(normalized) || { count: 0, files: new Set() };
      current.count += 1;
      current.files.add(file.replaceAll(path.sep, "/"));
      usage.set(normalized, current);
    }
  }

  return usage;
}

test("mapeia os raios de borda antes da padronização", () => {
  const usage = collectRadiusUsage();
  assert.ok(usage.size > 0, "Nenhuma classe de border radius foi encontrada.");

  console.log("RADIUS_AUDIT_START");
  for (const [token, details] of [...usage.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${token}\t${details.count}\t${[...details.files].join(",")}`);
  }
  console.log("RADIUS_AUDIT_END");
});
