"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { releaseContextError } = require("../scripts/verify-release-context.cjs");

const sha = "a".repeat(40);
const valid = {
  eventName: "workflow_dispatch",
  workflowRef: "GUKH7/Shifuh/.github/workflows/release-production.yml@refs/heads/main",
  deployProductionApproved: "true",
  confirmation: "PUBLICAR-SHIFUH-PRODUCAO",
  ref: "refs/heads/main",
  gateResult: "success",
  expectedSha: sha,
  requestedSha: sha,
  remoteSha: sha,
};

test("deployment guard accepts only the current tested main commit after a successful gate", () => {
  assert.equal(releaseContextError(valid), null);
});

test("deployment guard fails closed for unsuccessful, missing or unrelated CI context", () => {
  const invalidCases = [
    { eventName: "pull_request" },
    { eventName: "push" },
    { workflowRef: "GUKH7/Shifuh/.github/workflows/ci.yml@refs/heads/main" },
    { workflowRef: "GUKH7/Shifuh/.github/workflows/release-production.yml@refs/heads/feature" },
    { workflowRef: undefined },
    { confirmation: "" },
    { confirmation: "PUBLICAR-SHIFUH-PRODUCAO " },
    { confirmation: "false" },
    { confirmation: undefined },
    { requestedSha: "b".repeat(40) },
    { requestedSha: "invalid" },
    { requestedSha: undefined },
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
  const disabledDeployments = config.git.deploymentEnabled;
  const requiredDisabledBranches = {
    main: false,
    "feature/onboarding-pr-a-20261029": false,
    "feat/store-setup-onboarding-20261030": false,
    "feat/commercial-actions-20261030": false,
    "feat/manual-loyalty-credit-20261030": false,
    "fix/manual-credit-release-safety-20261102": false,
    "feat/manual-credit-client-picker-20261103": false,
    "feat/manual-points-quick-access-20261103": false,
    "feat/manual-customer-quick-registration-20261108": false,
    "feat/customer-hub-retention-20261109": false,
    "fix/hide-paused-storefront-products-20261109": false,
    "feat/mobile-purchase-ux-20261111": false,
  };
  // Never remove an existing protection when adding a new feature branch.
  for (const [branch, expected] of Object.entries(requiredDisabledBranches)) {
    assert.equal(disabledDeployments[branch], expected, `Missing deployment block for ${branch}`);
  }
  // Future feature branches may be added, but none may silently enable a Preview.
  for (const [branch, enabled] of Object.entries(disabledDeployments)) {
    assert.equal(enabled, false, `Git auto-deploy must remain disabled for ${branch}`);
  }
  assert.deepEqual(config.regions, ["pdx1"]);
});

const workflowPath = path.join(__dirname, "..", ".github", "workflows");
const validationWorkflow = fs.readFileSync(path.join(workflowPath, "ci.yml"), "utf8");
const productionWorkflow = fs.readFileSync(path.join(workflowPath, "release-production.yml"), "utf8");

test("CI manual validation has no deployment inputs, secrets or deployment job", () => {
  const ci = validationWorkflow;
  assert.match(ci, /\n  workflow_dispatch:\s*\n  [\s\S]*?workflow_call:/);
  assert.match(ci, /\n  pull_request:\s*\n  push:\s*\n    branches:\s*\n      - main/);
  assert.match(ci, /release-gate:\s*\n[\s\S]*?needs:\s*\n\s+- validate\s*\n\s+- commercial-e2e/);
  assert.doesNotMatch(ci, /deploy_production:|inputs\.deploy_production|deploy-production:|vercel deploy|VERCEL_TOKEN|environment: production/);
});

test("CI concurrency cannot cancel a distinct production-release workflow", () => {
  assert.match(validationWorkflow, /group: checks-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}-\$\{\{ github\.event_name \}\}/);
  assert.match(validationWorkflow, /cancel-in-progress: true/);
  assert.match(productionWorkflow, /group: production-release-workflow-/);
  assert.match(productionWorkflow, /cancel-in-progress: false/);
});

test("dedicated release requires typed exact commit SHA, confirmation and current main", () => {
  const release = productionWorkflow;
  assert.match(release, /\n  workflow_dispatch:\s*\n    inputs:/);
  assert.match(release, /commit_sha:\s*\n[\s\S]*?type: string\s*\n\s+required: true/);
  assert.match(release, /confirmation:\s*\n[\s\S]*?type: string\s*\n\s+required: true/);
  assert.match(release, /REQUESTED_SHA: \$\{\{ inputs\.commit_sha \}\}/);
  assert.match(release, /test "\$CONFIRMATION" = "PUBLICAR-SHIFUH-PRODUCAO"/);
  assert.match(release, /test "\$REQUESTED_SHA" = "\$RUN_SHA"/);
  assert.match(release, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(release, /\n  (?:pull_request|push|workflow_run):/);
});

test("dedicated release reuses all CI gates before ever accessing deploy credentials", () => {
  const release = productionWorkflow;
  assert.match(release, /gates:\s*\n    name:[^\n]*\n    needs: authorize\s*\n    uses: \.\/\.github\/workflows\/ci\.yml/);
  const deploy = release.split("\n  deploy-production:\n")[1];
  assert.ok(deploy, "production job only exists in dedicated release");
  assert.match(deploy, /needs:\s*\n      - authorize\s*\n      - gates/);
  assert.match(deploy, /needs\.gates\.result == 'success'/);
  assert.match(deploy, /inputs\.commit_sha == github\.sha/);
  assert.match(deploy, /inputs\.confirmation == 'PUBLICAR-SHIFUH-PRODUCAO'/);
  assert.match(deploy, /environment: production/);
  assert.match(deploy, /group: shifuh-production-deployment/);
  assert.match(deploy, /cancel-in-progress: false/);
  assert.match(deploy, /CI_GATE_RESULT: \$\{\{ needs\.gates\.result \}\}/);
  assert.match(deploy, /RELEASE_EXPECTED_SHA: \$\{\{ inputs\.commit_sha \}\}/);
  assert.match(deploy, /RELEASE_CONFIRMATION: \$\{\{ inputs\.confirmation \}\}/);
  assert.equal((deploy.match(/node scripts\/verify-release-context\.cjs/g) || []).length, 2);
  assert.equal((deploy.match(/git ls-remote origin refs\/heads\/main/g) || []).length, 2);
  assert.match(deploy, /vercel deploy --prebuilt --prod --yes/);
});

test("README records that the #204 merge commit already exists and must not be merged twice", () => {
  const guidance = fs.readFileSync(path.join(__dirname, "..", "docs", "release-control.md"), "utf8");
  assert.match(guidance, /PR #204/);
  assert.match(guidance, /2d2c682779c9acb77aac4452d25e3127b0a77229/);
  assert.match(guidance, /sem repetir o merge/);
});
