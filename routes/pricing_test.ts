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

// Dates relative to "now" so paid-through assertions can't rot: a hardcoded
// future date eventually slips into the past and flips the entitlement
// matrix (this exact failure shipped 2026-10-09, two months after 09-01).
const isoFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const PAST = "2026-01-01T00:00:00Z";

describe("pricing GET — anonymous", () => {
  it("returns fallback prices and no session state", async () => {
    const result = await handler.GET!(ctxFor(null) as never);
    assertEquals(result.data.prices.monthly, 1.99);
    assertEquals(result.data.prices.yearly, 15);
    assertEquals(result.data.userSub, null);
    assertEquals(result.data.freeGroupsCount, 0);
    assertEquals(result.data.hasNoRegistries, false);
  });
});

describe("pricing GET — authenticated (per-user model)", () => {
  it("counts effectively-free groups as upgrade candidates (owner or member)", async () => {
    stubFor([
      { role: "owner", plan: "free" },
      { role: "owner", plan: "free" },
      { role: "member", plan: "pro" },
    ], undefined);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.freeGroupsCount, 2);
    assertEquals(result.data.userSub, null);
  });

  it("a free group the user merely BELONGS to is an upgrade candidate", async () => {
    stubFor([{ role: "member", plan: "free" }], undefined);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.freeGroupsCount, 1);
  });

  it("a free group kept Pro by ANOTHER member is not a candidate", async () => {
    stubFor([
      { role: "member", plan: "free", member_pro: true },
      { role: "owner", plan: "free" },
    ], undefined);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.freeGroupsCount, 1);
  });

  it("a live subscription unlocks everything: no candidates, Active state", async () => {
    stubFor([
      { role: "owner", plan: "free" },
      { role: "owner", plan: "free" },
    ], SUB_ACTIVE);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.freeGroupsCount, 0);
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
      grace_until: PAST,
      current_period_end: PAST,
      cancel_at_period_end: false,
    });
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.userSub, null);
    assertEquals(result.data.freeGroupsCount, 1);
  });

  it("canceled-but-paid-through counts as live (rest of the cycle)", async () => {
    stubFor([{ role: "owner", plan: "free" }], {
      status: "canceled",
      grace_until: PAST,
      current_period_end: isoFromNow(10),
      cancel_at_period_end: false,
    });
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.userSub !== null, true);
    assertEquals(result.data.freeGroupsCount, 0);
  });

  it("flags grandfathered ownership", async () => {
    stubFor([
      { role: "owner", plan: "grandfathered" },
      { role: "owner", plan: "free" },
    ], undefined);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.hasGrandfatheredOwned, true);
    assertEquals(result.data.freeGroupsCount, 1);
  });

  it("marks a brand-new user with no registries", async () => {
    stubFor([], undefined);
    const result = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(result.data.hasNoRegistries, true);
  });
});
