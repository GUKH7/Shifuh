import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("src");
const PUBLIC_ROUTE_PATTERNS = [
  /src\/app\/api\/orders\/route\.ts$/,
  /src\/app\/api\/health(?:\/.*)?\/route\.ts$/,
  /src\/app\/api\/integrations\/ifood\/.*public.*\/route\.ts$/,
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolutePath)));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(absolutePath);
  }

  return files;
}

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll(path.sep, "/");
}

function hasAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

const files = await walk(ROOT);
const findings = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  if (!source.includes("createAdminClient")) continue;

  const filename = relative(file);
  const isRoute = /src\/app\/api\/.*\/route\.(?:ts|js)$/.test(filename);
  const isPublicRoute = PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(filename));
  const authenticatesUser = hasAny(source, [
    /auth\.getUser\s*\(/,
    /getUser\s*\(/,
    /requireAuthenticatedUser\s*\(/,
    /requireRestaurantAccess\s*\(/,
  ]);
  const resolvesRestaurant = hasAny(source, [
    /\.eq\(\s*["']user_id["']/,
    /\.eq\(\s*["']restaurant_id["']/,
    /p_restaurant_id\s*:/,
    /restaurant\.id/,
    /restaurantId/,
  ]);
  const hasPublicProtection = hasAny(source, [
    /checkRateLimit\s*\(/,
    /cron/i,
    /authorization/i,
    /bearer/i,
    /secret/i,
  ]);

  let classification = "library";
  let safe = true;
  const reasons = [];

  if (isRoute) {
    if (isPublicRoute) {
      classification = "public-route";
      safe = hasPublicProtection && resolvesRestaurant;
      if (!hasPublicProtection) reasons.push("rota pública sem rate limit, segredo ou autenticação equivalente");
      if (!resolvesRestaurant) reasons.push("rota pública sem escopo explícito de restaurante");
    } else {
      classification = "authenticated-route";
      safe = authenticatesUser && resolvesRestaurant;
      if (!authenticatesUser) reasons.push("rota administrativa sem autenticação detectável");
      if (!resolvesRestaurant) reasons.push("rota administrativa sem filtro ou vínculo de tenant detectável");
    }
  }

  findings.push({ filename, classification, safe, authenticatesUser, resolvesRestaurant, hasPublicProtection, reasons });
}

findings.sort((a, b) => a.filename.localeCompare(b.filename));

console.log("\nInventário de createAdminClient()\n");
for (const finding of findings) {
  const status = finding.safe ? "OK" : "REVISAR";
  console.log(`${status.padEnd(7)} ${finding.classification.padEnd(21)} ${finding.filename}`);
  for (const reason of finding.reasons) console.log(`         - ${reason}`);
}

console.log(`\nTotal: ${findings.length} arquivo(s); ${findings.filter((item) => !item.safe).length} pendência(s).`);

const unsafe = findings.filter((finding) => !finding.safe);
if (unsafe.length > 0) {
  console.error("\nA auditoria encontrou usos de service_role que exigem correção explícita.");
  process.exitCode = 1;
}
