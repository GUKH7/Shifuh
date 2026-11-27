# Merchant isolation — draft, not release-ready

Incident 2026-11-27: two restaurants shared a merchant and consumed different event batches. The disabled historical binding still exists. This draft rejects conflicting claims and checks ownership before polling, replay/ACK recovery, merchant/catalog actions and order actions. Foreign polling batches are rejected before persistence or ACK.

The unique index includes inactive configurations and is case-insensitive. It intentionally fails on existing duplicates; no winner is selected and no data is changed. Before any future release, review the historical link with the owner and obtain separate approval for clearing the incorrect binding (not orders/events). Do not publish while the duplicate remains.

CI uses the local Supabase CLI to create and apply the pending migration only in its disposable database; it uploads the generated migration for review. Commit the generated migration in this branch and remove the temporary CI materialization step before marking ready. Do not merge/deploy this draft. Validate migration preflight, direct RLS writes, ownership checks and all gates before release. No production migration or deployment is authorized.

The unique index arbitrates concurrent claims. Manual reassignment of a merchant while an operation is in flight remains a separate risk; do not transfer an active merchant without a controlled quiesce/reconciliation procedure.
