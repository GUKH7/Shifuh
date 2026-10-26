"use strict";

// Fail closed: even a successful past CI run cannot publish an outdated commit.
function releaseContextError(context) {
  if (context.eventName !== "workflow_dispatch") return "not a manual dispatch event";
  if (context.deployProductionApproved !== "true") return "production deployment not explicitly authorized";
  if (context.ref !== "refs/heads/main") return "not the main branch";
  if (context.gateResult !== "success") return "Release gate did not pass";
  if (!/^[0-9a-f]{40}$/.test(context.expectedSha || "")) return "invalid tested commit SHA";
  if (!/^[0-9a-f]{40}$/.test(context.remoteSha || "")) return "cannot resolve current main SHA";
  if (context.expectedSha !== context.remoteSha) return "main advanced since CI validation";
  return null;
}

if (require.main === module) {
  const error = releaseContextError({
    eventName: process.env.GITHUB_EVENT_NAME,
    deployProductionApproved: process.env.DEPLOY_PRODUCTION_APPROVED,
    ref: process.env.GITHUB_REF,
    gateResult: process.env.CI_GATE_RESULT,
    expectedSha: process.env.GITHUB_SHA,
    remoteSha: process.env.REMOTE_SHA,
  });
  if (error) {
    console.error("Production deployment blocked: " + error);
    process.exitCode = 1;
  } else {
    console.log("Production release context verified for tested main commit.");
  }
}

module.exports = { releaseContextError };
