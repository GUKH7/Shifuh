# Release control — Shifuh (Vercel + GitHub Actions)

## Status and incident (25/11/2026)

CI #1157 was run manually for main commit `2d2c682779c9acb77aac4452d25e3127b0a77229`.
The three validation jobs passed, but the manual dispatch unexpectedly selected the
production-deploy path. The Vercel production deployment
`dpl_3PENR3cNQje2WXBgr2hAKtSuHvuP` was **canceled** before READY.
The preceding READY deployment remains available on the public domains.

**The same incident must not be reproduced to test this correction.**

## Separation of privileges (proposed in this PR)

- `.github/workflows/ci.yml`: **validation only** for pull requests, pushes to
  `main`, manually dispatched CI, and calls from the dedicated release workflow.
  It has no production-deploy input, production job, token or Vercel CLI deploy.
  Jobs remain `validate`, `Commercial E2E` and `Release gate`.
- `.github/workflows/release-production.yml`: a **separate**, manual-only
  production workflow, disabled for push and pull_request events. Requires
  both an exact 40-character current `main` SHA and typing
  `PUBLICAR-SHIFUH-PRODUCAO`; otherwise it fails before validation.
  It invokes the reusable CI gates for that same commit. Only with successful
  authorization and gates can its production job obtain deployment credentials.
- `scripts/verify-release-context.cjs`: fails closed for wrong workflow, missing
  approval phrase, different request/current/tested SHA, non-main ref,
  or unsuccessful gates. Checks current `main` before *and* after building.
- `vercel.json`: auto-deploy of `main` and this feature branch remain disabled.

A green CI **does not** authorize publication. A production release must have a
separate explicit business approval and controlled use of the dedicated workflow,
preferably with GitHub Environment `production` approval/restrictions.
Never choose Production release when the goal is only to validate code.

## How to validate safely

1. On a PR, inspect the automatic `CI` run. It must have the three green gates
   and no `Deploy production` job at all.
2. Run `node --test tests/release-deployment-gate.test.js` to exercise wrong
   event/workflow, incorrect confirmation, stale SHA, failed gates and invalid
   branch without contacting Vercel.
3. Confirm the root GitHub branch ruleset still requires the `Release gate`.
   Git auto-deploy must remain disabled.
4. Do **not** invoke `workflow_dispatch`, the dedicated release workflow, a
   Vercel Preview, remote database migrations or any production operation to
   homologate these guardrails.
5. Before a future publication, verify protected `main`, clean approved CI,
   current exact SHA, GitHub Environment rules, credentials scoped to the right
   Vercel project and a separate explicit user authorization.

## PR #204 bookkeeping (do not merge again)

The PR #204 branch head is
`60c7849f213048d611e3f1870c1e23bd2ecd8fcb`.
The `main` merge commit
`2d2c682779c9acb77aac4452d25e3127b0a77229` has parents
`232e9aa63174948b88a18178d98c51ed66d32b34` (previous main) and
`60c7849f213048d611e3f1870c1e23bd2ecd8fcb` (PR head). The GitHub PR
metadata nevertheless still reports the PR as open and not merged.

The code is already in `main`: **sem repetir o merge**. After this safety
correction is validated and separately authorized, close PR #204 administratively
as already integrated, citing the exact merge commit and noting that GitHub's PR
metadata was inconsistent. Do not alter its branch or attempt another merge.

## Constraints

- GitHub Actions and Vercel Hobby should use no paid add-ons for these guards.
- No secrets, tokens, personal data or private orders in PRs, tests or logs.
- Existing production deployment and public domains are not to be changed
  without explicit separate deployment authorization.
- Manual CLI/API deployments by credential holders remain privileged bypasses;
  restrict those credentials to trusted maintainers and review Environment rules.
