"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { releaseContextError } = require("../scripts/verify-release-context.cjs");

const sha = "a".repeat(40);
const valid = {
  eventName: "workflow_dispatch",
  deployProductionApproved: "true",
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
    { eventName: "push" },
    { deployProductionApproved: "false" },
    { deployProductionApproved: "TRUE" },
    { deployProductionApproved: undefined },
    { deployProductionApproved: true },
    { ref: "refs/heads/release" },
    { ref: "refs/tags/v1.0.0" },
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

test("Vercel keeps Git auto-deploy of main disabled independently of preview project settings", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.deepEqual(config.git.deploymentEnabled, {
    main: false,
    "feature/onboarding-pr-a-20261029": false,
    "feat/store-setup-onboarding-20261030": false,
    "feat/commercial-actions-20261030": false,
    "feat/manual-loyalty-credit-20261030": false,
  });
  assert.deepEqual(config.regions, ["pdx1"]);
});

test("workflow retains automatic gates and defaults manual production authorization to false", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  const config = workflow.split("\n  workflow_dispatch:\n")[1].split("\n  pull_request:\n")[0];
  assert.match(config, /deploy_production:/);
  assert.match(config, /type: boolean/);
  assert.match(config, /required: false/);
  assert.match(config, /default: false/);
  assert.match(workflow, /\n  pull_request:\n  push:\n    branches:\n      - main/);
  assert.match(workflow, /release-gate:\s*\n[\s\S]*?needs:\s*\n\s+- validate\s*\n\s+- commercial-e2e/);
});

test("manual production run has isolated concurrency and cannot be canceled by push CI", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  const concurrency = workflow.split("\nconcurrency:\n")[1].split("\njobs:\n")[0];
  assert.match(concurrency, /inputs\.deploy_production == true/);
  assert.match(concurrency, /'manual-production' \|\| 'checks'/);
  assert.match(concurrency, /cancel-in-progress: \$\{\{ !\(/);
});

test("production deploy job depends on Release gate and requires explicit manual authorization on main", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  const deployJob = workflow.split("\n  deploy-production:\n")[1];
  assert.ok(deployJob, "gated production job must exist");
  assert.match(deployJob, /needs: release-gate/);
  assert.match(deployJob, /github\.event_name == 'workflow_dispatch'/);
  assert.match(deployJob, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deployJob, /inputs\.deploy_production == true/);
  assert.doesNotMatch(deployJob, /github\.event_name == 'push'/);
  assert.match(deployJob, /DEPLOY_PRODUCTION_APPROVED: \$\{\{ inputs\.deploy_production \}\}/);
  assert.match(deployJob, /needs\.release-gate\.result == 'success'/);
  assert.equal((deployJob.match(/node scripts\/verify-release-context\.cjs/g) || []).length, 2);
  assert.equal((deployJob.match(/git ls-remote origin refs\/heads\/main/g) || []).length, 2);
  assert.match(deployJob, /vercel deploy --prebuilt --prod --yes/);
  assert.match(deployJob, /environment: production/);
  assert.match(deployJob, /group: shifuh-production-deployment/);
  assert.match(deployJob, /cancel-in-progress: false/);
  assert.match(workflow, /release-gate:\s*\n[\s\S]*?needs:\s*\n\s+- validate\s*\n\s+- commercial-e2e/);
});
