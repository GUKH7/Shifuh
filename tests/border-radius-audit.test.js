const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const SOURCE_ROOTS = ["src/app", "src/components", "src/features"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const LEGACY_ARBITRARY_TOKENS = new Set([
  "rounded-[16px]",
  "rounded-[18px]",
  "rounded-[20px]",
  "rounded-[22px]",
  "rounded-[24px]",
  "rounded-[26px]",
  "rounded-[28px]",
  "rounded-[30px]",
  "rounded-[32px]",
  "rounded-b-[18px]",
  "rounded-t-[24px]",
  "rounded-t-[30px]",
  "sm:rounded-[18px]",
  "sm:rounded-[20px]",
  "sm:rounded-[22px]",
  "sm:rounded-[24px]",
  "sm:rounded-[28px]",
  "sm:rounded-[30px]",
  "sm:rounded-b-[28px]",
]);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function sourceFiles() {
  return SOURCE_ROOTS.flatMap(walk)
    .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)))
    .sort();
}

function collectRadiusUsage() {
  const usage = new Map();

  for (const file of sourceFiles()) {
    const content = fs.readFileSync(file, "utf8");
    const matches = content.match(/\b(?:[a-z0-9-]+:)*rounded(?:-[^\s"'`{}<>]+)?/g) || [];

    for (const token of matches) {
      const normalized = token.replace(/[),;]+$/, "");
      usage.set(normalized, (usage.get(normalized) || 0) + 1);
    }
  }

  return usage;
}

function filesUsingRadius(token) {
  return sourceFiles().filter((file) => fs.readFileSync(file, "utf8").includes(token));
}

function isApprovedScaleToken(token) {
  const utility = token.split(":").at(-1);
  return /^rounded(?:-(?:t|r|b|l|tl|tr|br|bl))?-(?:sm|md|lg|xl|2xl|3xl|full)$/.test(
    utility,
  ) || utility === "rounded";
}

test("Tailwind usa uma única escala semântica de border radius", () => {
  const config = fs.readFileSync("tailwind.config.ts", "utf8");

  assert.match(config, /sm: "var\(--radius-small\)"/);
  assert.match(config, /DEFAULT: "var\(--radius-small\)"/);
  assert.match(config, /lg: "var\(--radius-control\)"/);
  assert.match(config, /xl: "var\(--radius-control\)"/);
  assert.match(config, /"2xl": "var\(--radius-card\)"/);
  assert.match(config, /"3xl": "var\(--radius-panel\)"/);
  assert.match(config, /full: "var\(--radius-pill\)"/);
});

test("tokens globais definem quatro níveis e preservam círculos e pílulas", () => {
  const styles = fs.readFileSync("src/app/globals.css", "utf8");

  assert.match(styles, /--radius-small: 8px/);
  assert.match(styles, /--radius-control: 12px/);
  assert.match(styles, /--radius-card: 16px/);
  assert.match(styles, /--radius-panel: 20px/);
  assert.match(styles, /--radius-pill: 9999px/);
  assert.match(styles, /--admin-radius-control: var\(--radius-control\)/);
  assert.match(styles, /--admin-radius-card: var\(--radius-panel\)/);
  assert.doesNotMatch(styles, /--admin-radius-control: 14px/);
  assert.doesNotMatch(styles, /--admin-radius-card: 24px/);
});

test("valores arbitrários ficam restritos ao conjunto legado aprovado", () => {
  const styles = fs.readFileSync("src/app/globals.css", "utf8");
  const usage = collectRadiusUsage();

  for (const [token, count] of usage) {
    if (isApprovedScaleToken(token)) continue;

    assert.ok(
      LEGACY_ARBITRARY_TOKENS.has(token),
      `Border radius fora da escala: ${token}. Use rounded-lg, rounded-2xl, rounded-3xl ou rounded-full. Arquivos: ${filesUsingRadius(token).join(", ")}`,
    );
  }

  assert.doesNotMatch(styles, /\[class\*=/);

  for (const value of [16, 18, 20, 22, 24, 26, 28, 32]) {
    assert.ok(
      styles.includes(`rounded-\\[${value}px\\]`),
      `Falta normalizar rounded-[${value}px] na camada de compatibilidade.`,
    );
  }

  assert.ok(styles.includes("rounded-b-\\[18px\\]"));
  assert.ok(styles.includes("rounded-t-\\[24px\\]"));
  assert.ok(styles.includes("sm\\:rounded-\\[18px\\]"));
  assert.ok(styles.includes("sm\\:rounded-b-\\[28px\\]"));
  assert.match(styles, /@media \(min-width: 640px\)/);
});
