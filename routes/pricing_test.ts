/**
 * Handler-level tests for the public pricing page under the per-user
 * subscription model: session-state matrix (anonymous, owned-free,
 * live/cancel-scheduled subscription, grandfathered, none). Prices fall
 * back to constants (no Polar token in tests); queries run against the db
 * stub, differentiated by SQL text (memberships vs subscription lookup).
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { handler } from "./pricing.tsx";
import { makeCtx } from "../test/helpers.ts";
import { __resetDbStub, __setQueryResult } from "../test/fixtures/db_stub.ts";

const URL = "https://test.local/pricing";

beforeEach(() => {
  __resetDbStub();
  Deno.env.delete("POLAR_ACCESS_TOKEN");
});

function ctxFor(user: { id: string } | null, query = "") {
  return makeCtx({
    req: new Request(URL + query),
    state: { user: user as never, locale: "es" },
  });
}

function stubFor(
  memberships: Record<string, unknown>[],
  sub: Record<string, unknown> | undefined,
) {
  __setQueryResult((text) => {
    if (text.includes("FROM registry_subscriptions WHERE user_id")) {
      return { rows: sub ? [sub] : [] };
    }
    return { rows: memberships };
  });
}

const SUB_ACTIVE = {
  status: "active",
  grace_until: null,
  current_period_end: "2026-09-01T00:00:00Z",
  cancel_at_period_end: false,
};

describe("pricing GET — anonymous", () => {
  it("returns fallback prices and no session state", async () => {
    const result = await handler.GET!(ctxFor(null) as never);
    assertEquals(result.data.prices.monthly, 1.99);
    assertEquals(result.data.prices.yearly, 15);
    assertEquals(result.data.userSub, null);
    assertEquals(result.data.ownedFreeCount, 0);
    assertEquals(result.data.hasNoRegistries, false);
  });
});

describe("pricing GET — authenticated (per-user model)", () => {
  it("counts owned free registries as upgrade candidates", async () => {
    stubFor([
      { role: "owner", plan: "free" },
      { role: "owner", plan: "free" },
      { role: "member", plan: "pro" },
    ], undefined);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.ownedFreeCount, 2);
    assertEquals(result.data.hasMemberOnly, true);
    assertEquals(result.data.userSub, null);
  });

  it("a live subscription unlocks everything: no candidates, Active state", async () => {
    stubFor([
      { role: "owner", plan: "free" },
      { role: "owner", plan: "free" },
    ], SUB_ACTIVE);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.ownedFreeCount, 0);
    assertEquals(result.data.userSub?.currentPeriodEnd, "2026-09-01T00:00:00Z");
    assertEquals(result.data.userSub?.cancelScheduled, false);
  });

  it("carries the cancel-scheduled flag", async () => {
    stubFor([{ role: "owner", plan: "pro" }], {
      ...SUB_ACTIVE,
      cancel_at_period_end: true,
    });
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.userSub?.cancelScheduled, true);
  });

  it("a dead subscription (beyond grace and paid-through) is not Active", async () => {
    stubFor([{ role: "owner", plan: "free" }], {
      status: "canceled",
      grace_until: "2026-01-01T00:00:00Z",
      current_period_end: "2026-01-01T00:00:00Z",
      cancel_at_period_end: false,
    });
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.userSub, null);
    assertEquals(result.data.ownedFreeCount, 1);
  });

  it("canceled-but-paid-through counts as live (rest of the cycle)", async () => {
    stubFor([{ role: "owner", plan: "free" }], {
      status: "canceled",
      grace_until: "2026-01-01T00:00:00Z",
      current_period_end: "2026-09-01T00:00:00Z",
      cancel_at_period_end: false,
    });
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.userSub !== null, true);
    assertEquals(result.data.ownedFreeCount, 0);
  });

  it("flags grandfathered ownership", async () => {
    stubFor([
      { role: "owner", plan: "grandfathered" },
      { role: "owner", plan: "free" },
    ], undefined);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.hasGrandfatheredOwned, true);
    assertEquals(result.data.ownedFreeCount, 1);
  });

  it("marks a brand-new user with no registries", async () => {
    stubFor([], undefined);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.hasNoRegistries, true);
  });
});
