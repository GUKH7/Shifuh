"use strict";

// Fail closed: production releases must come from the dedicated workflow,
// after its reused CI gates pass, for the exact reviewed main SHA.
const APPROVAL_PHRASE = "PUBLICAR-SHIFUH-PRODUCAO";
const RELEASE_WORKFLOW_REF = "GUKH7/Shifuh/.github/workflows/release-production.yml@refs/heads/main";

function releaseContextError(context) {
  if (context.eventName !== "workflow_dispatch") return "not a manual dispatch event";
  if (context.workflowRef !== RELEASE_WORKFLOW_REF) return "not the dedicated production release workflow";
  if (context.deployProductionApproved !== "true") return "production deployment not explicitly authorized";
  if (context.confirmation !== APPROVAL_PHRASE) return "missing deliberate release confirmation";
  if (context.ref !== "refs/heads/main") return "not the main branch";
  if (context.gateResult !== "success") return "Release gate did not pass";
  if (!/^[0-9a-f]{40}$/.test(context.expectedSha || "")) return "invalid tested commit SHA";
  if (!/^[0-9a-f]{40}$/.test(context.requestedSha || "")) return "invalid requested release SHA";
  if (context.requestedSha !== context.expectedSha) return "requested SHA differs from tested commit";
  if (!/^[0-9a-f]{40}$/.test(context.remoteSha || "")) return "cannot resolve current main SHA";
  if (context.expectedSha !== context.remoteSha) return "main advanced since CI validation";
  return null;
}

if (require.main === module) {
  const error = releaseContextError({
    eventName: process.env.GITHUB_EVENT_NAME,
    workflowRef: process.env.GITHUB_WORKFLOW_REF,
    deployProductionApproved: process.env.DEPLOY_PRODUCTION_APPROVED,
    confirmation: process.env.RELEASE_CONFIRMATION,
    ref: process.env.GITHUB_REF,
    gateResult: process.env.CI_GATE_RESULT,
    expectedSha: process.env.GITHUB_SHA,
    requestedSha: process.env.RELEASE_EXPECTED_SHA,
    remoteSha: process.env.REMOTE_SHA,
  });
  if (error) {
    console.error("Production deployment blocked: " + error);
    process.exitCode = 1;
  } else {
    console.log("Production release context verified for tested main commit.");
  }
}

module.exports = { releaseContextError, APPROVAL_PHRASE, RELEASE_WORKFLOW_REF };
