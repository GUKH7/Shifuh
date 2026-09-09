import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-owner@shifuh.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";

async function loginVerifiedCustomer(page: Page) {
  await page.goto("/admin/login");
  await page.getByPlaceholder("seu@email.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 20_000 });
}

async function browserRedeem(page: Page, rewardId: string, idempotencyKey: string) {
  return page.evaluate(
    async ({ rewardId, idempotencyKey }) => {
      const response = await fetch("/api/customer/loyalty/redeem", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ rewardId }),
      });
      return {
        status: response.status,
        payload: await response.json().catch(() => ({})),
      };
    },
    { rewardId, idempotencyKey },
  );
}

test.describe("segurança final da fidelidade", () => {
  test.describe.configure({ mode: "serial" });

  test("bloqueia fraude de identidade, RPC direta, replay e double-spend", async ({ page, request }) => {
    test.setTimeout(90_000);
    expect(ADMIN_PASSWORD).toBeTruthy();
    expect(SUPABASE_URL).toBeTruthy();
    expect(ANON_KEY).toBeTruthy();
    expect(SERVICE_ROLE_KEY).toBeTruthy();

    const service = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: program, error: programError } = await service
      .from("loyalty_programs")
      .select("id, restaurant_id")
      .eq("restaurant_id", RESTAURANT_ID)
      .single();
    expect(programError).toBeNull();
    expect(program?.id).toBeTruthy();

    const { data: account, error: accountError } = await service
      .from("loyalty_accounts")
      .select("id, customer_id, points_balance")
      .eq("program_id", program!.id)
      .single();
    expect(accountError).toBeNull();
    expect(Number(account?.points_balance)).toBe(9);

    const { data: existingReward, error: existingRewardError } = await service
      .from("loyalty_rewards")
      .select("id")
      .eq("program_id", program!.id)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    expect(existingRewardError).toBeNull();

    // Checkout/account cookies without a verified Supabase Auth session are not customer identity.
    await page.goto("/loja-e2e");
    const anonymousAttempt = await browserRedeem(page, existingReward!.id, crypto.randomUUID());
    expect(anonymousAttempt.status).toBe(401);
    expect(anonymousAttempt.payload.code).toBe("LOYALTY_SESSION_REQUIRED");

    // Cookie-authenticated mutations must originate from the same Shifuh origin.
    const crossOriginAttempt = await request.post("/api/customer/loyalty/redeem", {
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: { rewardId: existingReward!.id },
    });
    expect(crossOriginAttempt.status()).toBe(403);
    expect((await crossOriginAttempt.json()).code).toBe("INVALID_REQUEST_ORIGIN");

    // Public/anon clients never receive the privileged mutation surface.
    const directRpc = await anon.rpc("redeem_loyalty_reward", {
      p_reward_id: existingReward!.id,
      p_customer_phone: "11988887777",
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(directRpc.error).toBeTruthy();

    const directLedgerMutation = await anon.from("loyalty_point_transactions").insert({
      account_id: account!.id,
      restaurant_id: RESTAURANT_ID,
      program_id: program!.id,
      customer_id: account!.customer_id,
      transaction_type: "adjustment_credit",
      points_delta: 999999,
      balance_after: 999999,
      idempotency_key: `attack:${crypto.randomUUID()}`,
      description: "fraud attempt",
    });
    expect(directLedgerMutation.error).toBeTruthy();

    // Add exactly enough test credit that two concurrent redemptions cannot both succeed.
    const creditKey = `e2e-security-credit:${crypto.randomUUID()}`;
    const creditResult = await service.from("loyalty_point_transactions").insert({
      account_id: account!.id,
      restaurant_id: RESTAURANT_ID,
      program_id: program!.id,
      customer_id: account!.customer_id,
      transaction_type: "adjustment_credit",
      points_delta: 11,
      balance_after: 0,
      idempotency_key: creditKey,
      description: "Crédito controlado do E2E de segurança",
      metadata: { source: "loyalty-security-e2e" },
    });
    expect(creditResult.error).toBeNull();

    const rewardName = `Antifraude E2E ${Date.now()}`;
    const { data: guardedReward, error: rewardError } = await service
      .from("loyalty_rewards")
      .insert({
        restaurant_id: RESTAURANT_ID,
        program_id: program!.id,
        name: rewardName,
        reward_type: "fixed",
        points_cost: 15,
        fixed_amount: 3,
        minimum_order_amount: 0,
        active: true,
      })
      .select("id")
      .single();
    expect(rewardError).toBeNull();

    await loginVerifiedCustomer(page);

    const concurrentKeys = [crypto.randomUUID(), crypto.randomUUID()];
    const concurrentAttempts = await page.evaluate(
      async ({ rewardId, keys }) => Promise.all(keys.map(async (idempotencyKey) => {
        const response = await fetch("/api/customer/loyalty/redeem", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ rewardId }),
        });
        return {
          idempotencyKey,
          status: response.status,
          payload: await response.json().catch(() => ({})),
        };
      })),
      { rewardId: guardedReward!.id, keys: concurrentKeys },
    );

    expect(concurrentAttempts.map((attempt) => attempt.status).sort()).toEqual([200, 409]);
    const successfulAttempt = concurrentAttempts.find((attempt) => attempt.status === 200)!;
    const rejectedAttempt = concurrentAttempts.find((attempt) => attempt.status === 409)!;
    expect(rejectedAttempt.payload.code).toBe("LOYALTY_INSUFFICIENT_POINTS");
    expect(successfulAttempt.payload.redemption.balanceAfter).toBe(5);

    const { data: balanceAfterRace } = await service
      .from("loyalty_accounts")
      .select("points_balance")
      .eq("id", account!.id)
      .single();
    expect(Number(balanceAfterRace?.points_balance)).toBe(5);

    const { count: raceRedemptionCount, error: raceCountError } = await service
      .from("loyalty_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("reward_id", guardedReward!.id);
    expect(raceCountError).toBeNull();
    expect(raceRedemptionCount).toBe(1);

    // Same request key is a safe replay: it returns the same issuance without another debit.
    const safeReplay = await browserRedeem(page, guardedReward!.id, successfulAttempt.idempotencyKey);
    expect(safeReplay.status).toBe(200);
    expect(safeReplay.payload.redemption.id).toBe(successfulAttempt.payload.redemption.id);
    expect(safeReplay.payload.redemption.balanceAfter).toBe(5);

    // Reusing the successful key for a different reward is rejected tenant-side.
    const conflictingReplay = await browserRedeem(page, existingReward!.id, successfulAttempt.idempotencyKey);
    expect(conflictingReplay.status).toBe(409);
    expect(conflictingReplay.payload.code).toBe("LOYALTY_IDEMPOTENCY_CONFLICT");

    const { data: issuedBenefit, error: issuedBenefitError } = await service
      .from("customer_rewards")
      .select("id, loyalty_redemption_id, status, label")
      .eq("loyalty_redemption_id", successfulAttempt.payload.redemption.id)
      .single();
    expect(issuedBenefitError).toBeNull();
    expect(issuedBenefit?.status).toBe("available");

    // Audit snapshots cannot have owner/value fields rewritten or be deleted.
    const rewriteBenefit = await service
      .from("customer_rewards")
      .update({ label: "Benefício adulterado" })
      .eq("id", issuedBenefit!.id);
    expect(rewriteBenefit.error?.message).toContain("immutable");

    const deleteBenefit = await service
      .from("customer_rewards")
      .delete()
      .eq("id", issuedBenefit!.id);
    expect(deleteBenefit.error?.message).toContain("immutable");

    const rewriteRedemption = await service
      .from("loyalty_redemptions")
      .update({ label: "Resgate adulterado" })
      .eq("id", successfulAttempt.payload.redemption.id);
    expect(rewriteRedemption.error?.message).toContain("immutable");

    const deleteRedemption = await service
      .from("loyalty_redemptions")
      .delete()
      .eq("id", successfulAttempt.payload.redemption.id);
    expect(deleteRedemption.error?.message).toContain("immutable");
  });
});
