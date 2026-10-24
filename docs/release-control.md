# Release control — Vercel Hobby + GitHub Actions

## Purpose

Prevent a production deployment from reaching customer-facing domains before
the exact current `main` commit passes the audit, unit tests, lint, typecheck,
build, Commercial E2E and the Release gate.

This is a two-part change:

- `vercel.json` turns off *Git-initiated automatic deployments for main only*.
  It leaves feature-branch preview deployments enabled.
- `.github/workflows/ci.yml` adds a production deploy job that runs **only**
  after the existing Release gate succeeds on a push to `main`.
  The release job validates that `main` still matches the tested commit
  before and immediately prior to publishing.

Do **not** merge this PR until the prerequisites below are complete.
If credentials are missing, production remains on its last READY deployment,
but future releases will be blocked (fail closed).

## Activation prerequisites (before merging)

1. In GitHub, go to **Settings → Secrets and variables → Actions**.
   Create repository secret `VERCEL_TOKEN` with a Vercel access token. Do not
   put it in a file, PR, issue, chat, or workflow logs.
2. Create repository variables with these exact non-secret IDs:
   - `VERCEL_ORG_ID`: `team_BT3bKmQy2CQZuBfbYCXn6Kvx`
   - `VERCEL_PROJECT_ID`: `prj_xbc3vhTqeAALAU5YISctILMPkzSt`
3. Ensure the token has permission to deploy to the **shifuh** project of that
   Vercel team. The job uses a pinned Vercel CLI, does a production `vercel pull`
   and `vercel build`, then deploys `--prebuilt --prod`.
4. Create a GitHub `production` Environment, restrict deployment branches to
   `main`, and optionally require a reviewer before release. The deploy job
   references this Environment. Avoid a required reviewer when working alone
   unless another trusted approver is available.
5. Protect the public repository's **main** branch in GitHub
   (**Settings → Rules → Rulesets** or **Branches**):
   - Require pull requests before merging.
   - Require the exact check **Release gate** (GitHub Actions).
   - Require branches to be current before merging, if practical.
   - Block force pushes and branch deletion; do not bypass rules routinely.
   - Keep check names unique; do not require the `Deploy production (gated)`
     job as a PR check because it intentionally skips pull requests.
   - If you are the only contributor, approval count can remain zero.

The connected GitHub integration cannot administer branch protection or
create Actions secrets. These setup steps must be completed in the GitHub UI.

## Safe activation

1. Confirm the current production deployment is **READY** and health checks pass.
2. Confirm this PR has green `validate`, `Commercial E2E`, and `Release gate`
   on its latest SHA and the Vercel Preview is working.
3. Confirm the GitHub secret and two variables above exist and the target project
   is correct. Optionally test the credentials through a *non-production*
   authenticated `vercel pull` in an isolated, reviewed workflow.
4. Only then merge this PR. Its `main` deployment will be generated **after**
   its CI and E2E succeed, not on the immediate GitHub push.
5. Verify that `Deploy production (gated)` succeeds and the Vercel deployment
   SHA equals the merged commit. Smoke-test `/api/health`,
   `/api/health/ready`, storefront, and authenticated dashboard.

## Failure behavior and dry-run

- Failed audit, tests, lint, typecheck, build, or E2E => Release gate fails =>
  `Deploy production (gated)` is skipped. Vercel does not automatically
  deploy `main`; the previous production build stays in place.
- Missing token/variables => release job fails clearly before installing the
  CLI, leaving the previous production build in place.
- `main` advances during validation or build => the release guard rejects the
  stale commit rather than deploying it.
- On PRs, deployment skips even when the CI is green.
- Dry-run the negative paths with
  `node --test tests/release-deployment-gate.test.js`. These simulate failed
  gates, stale commits, wrong events and branches without touching production.
- A *real* end-to-end failure gate should be validated after branch protection
  is active, through a failing PR (which must not be merged). Never intentionally
  merge broken code to test the gate.

## Rollback and limitations

For a runtime problem after a successful release, use Vercel's deployment
dashboard to roll back to the immediately preceding working production build
(Hobby rollback limitations apply). Record incident details and only re-release
a tested fix.

Vercel's Deployment Checks can also block production promotion, but this
workflow uses CI-gated deployment and Vercel's `git.deploymentEnabled` setting
to avoid needing a paid feature or project-level check setup. Protecting GitHub
`main` from manual direct pushes is still a separate GitHub ruleset step.
CLI/API manual production deployments by someone with credentials remain a
privileged bypass, so restrict credentials to trusted maintainers.

The Vercel Hobby plan is intended for non-commercial use; upgrade to an
appropriate plan before charging customers or running commercial workloads.
