"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { releaseContextError } = require("../scripts/verify-release-context.cjs");

const sha = "a".repeat(40);
const valid = {
  eventName: "push",
  ref: "refs/heads/main",
  gateResult: "success",
  expectedSha: sha,
  remoteSha: sha,
};

test("deployment guard accepts only the current tested main commit after a successful gate", () => {
  assert.equal(releaseContextError(valid), null);
});

test("deployment guard fails closed for unsuccessful, missing or unrelated CI context", () => {
  const invalidCases = [
    { eventName: "pull_request" },
    { eventName: "workflow_dispatch" },
    { ref: "refs/heads/release" },
    { gateResult: "failure" },
    { gateResult: "skipped" },
    { gateResult: undefined },
    { expectedSha: "invalid" },
    { remoteSha: "" },
    { remoteSha: "b".repeat(40) },
  ];
  for (const overrides of invalidCases) {
    assert.ok(releaseContextError({ ...valid, ...overrides }), JSON.stringify(overrides));
  }
});

test("Vercel disables only automatic deployment of main, preserving feature previews", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.deepEqual(config.git.deploymentEnabled, { main: false });
  assert.deepEqual(config.regions, ["pdx1"]);
});

test("production deploy job depends on Release gate and is restricted to successful main pushes", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  const deployJob = workflow.split("\n  deploy-production:\n")[1];
  assert.ok(deployJob, "gated production job must exist");
  assert.match(deployJob, /needs: release-gate/);
  assert.match(deployJob, /github\.event_name == 'push'/);
  assert.match(deployJob, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deployJob, /needs\.release-gate\.result == 'success'/);
  assert.match(deployJob, /node scripts\/verify-release-context\.cjs/g);
  assert.match(deployJob, /vercel deploy --prebuilt --prod --yes/);
  assert.match(deployJob, /environment: production/);
  assert.match(workflow, /release-gate:\s*\n[\s\S]*?needs:\s*\n\s+- validate\s*\n\s+- commercial-e2e/);
});
