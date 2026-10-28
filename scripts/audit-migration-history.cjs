"use strict";
// Read-only filesystem audit. Never opens a network connection or executes SQL.
const fs = require("node:fs");
const path = require("node:path");

function extractMigration(file) {
  const match = /^(\d+)_([a-z0-9_]+)\.sql$/i.exec(path.basename(file));
  if (!match) return null;
  return { version: match[1], name: match[2] };
}
function auditMigrationHistory(repositoryFiles, appliedMigrations) {
  const sources = repositoryFiles.map(extractMigration).filter(Boolean);
  const applied = appliedMigrations.map((m) => ({
    version: String(m.version), name: String(m.name),
  }));
  const bySource = new Map(sources.map((m) => [m.name, m]));
  const byApplied = new Map(applied.map((m) => [m.name, m]));
  return {
    repositoryCount: sources.length,
    appliedCount: applied.length,
    unappliedByName: sources.filter((m) => !byApplied.has(m.name)),
    databaseOnly: applied.filter((m) => !bySource.has(m.name)),
    timestampDrift: sources.filter((m) => byApplied.has(m.name) &&
      byApplied.get(m.name).version !== m.version).map((m) => ({
        name: m.name, repoVersion: m.version,
        dbVersion: byApplied.get(m.name).version,
      })),
  };
}
if (require.main === module) {
  const argIndex = process.argv.indexOf("--applied-file");
  const snapshotPath = argIndex >= 0 ? process.argv[argIndex + 1] : null;
  if (argIndex >= 0 && !snapshotPath) {
    console.error("Usage: node scripts/audit-migration-history.cjs [--applied-file local-read-only-snapshot.json]");
    process.exitCode = 2;
  } else {
    const base = path.join(__dirname, "..", "supabase", "migrations");
    const files = fs.readdirSync(base).filter((p) => p.endsWith(".sql"));
    if (!snapshotPath) {
      console.log(JSON.stringify({
        repositoryMigrationFiles: files.length, appliedHistory: "NOT PROVIDED",
        note: "No database contacted; supply a local JSON snapshot to compare versions.",
      }, null, 2));
    } else {
      const input = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
      if (!Array.isArray(input) || input.some((m) => !m || m.name == null || m.version == null)) {
        throw new Error("The local applied-migrations snapshot must be an array of {version,name}.");
      }
      const report = auditMigrationHistory(files, input);
      console.log(JSON.stringify(report, null, 2));
      if (report.unappliedByName.length || report.databaseOnly.length || report.timestampDrift.length) {
        process.exitCode = 1; // Never attempt to repair migration history automatically.
      }
    }
  }
}
module.exports = { extractMigration, auditMigrationHistory };
