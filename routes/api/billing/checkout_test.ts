/**
 * Handler-level tests for the checkout redirect's already-subscribed guard:
 * a live subscription (active/trialing, canceled-but-paid-through, or within
 * grace) must bounce to /pricing?already_subscribed=1 instead of reaching
 * Polar — a second checkout would create a second subscription and a second
 * charge for the same customer.
 *
 * Queries run against the db stub, differentiated by SQL text (subscription
 * lookup). Polar env vars are set per-case via Deno.env.
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { handler } from "./checkout.ts";
import { makeCtx } from "../../../test/helpers.ts";
import {
  __resetDbStub,
  __setQueryResult,
} from "../../../test/fixtures/db_stub.ts";

const URL_ = "https://test.local/api/billing/checkout?interval=monthly";

beforeEach(() => {
  __resetDbStub();
  Deno.env.set("POLAR_ACCESS_TOKEN", "polar_oat_test");
  Deno.env.set(
    "POLAR_CHECKOUT_LINK",
    "https://sandbox.polar.sh/checkout/polar_c_test",
  );
});

function ctxFor(user: { id: string } | null) {
  return makeCtx({
    req: new Request(URL_),
    state: { user: user as never, locale: "en" },
  });
}

function stubSub(sub: Record<string, unknown> | undefined) {
  __setQueryResult((text) => {
    if (text.includes("FROM registry_subscriptions WHERE user_id")) {
      return { rows: sub ? [sub] : [] };
    }
    return { rows: [] };
  });
}

describe("billing checkout guard", () => {
  it("401s without a session", async () => {
    const res = await handler.GET!(ctxFor(null) as never);
    assertEquals(res.status, 401);
  });

  it("redirects to Polar when there is no subscription row", async () => {
    stubSub(undefined);
    const res = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(res.status, 302);
    assertEquals(
      res.headers.get("location")?.startsWith(
        "https://sandbox.polar.sh/checkout/polar_c_test?",
      ),
      true,
    );
  });

  it("bounces active/trialing subscribers back to /pricing", async () => {
    for (const status of ["active", "trialing"]) {
      stubSub({
        status,
        grace_until: null,
        current_period_end: null,
      });
      const res = await handler.GET!(ctxFor({ id: "u1" }) as never);
      assertEquals(res.status, 302);
      assertEquals(
        res.headers.get("location"),
        "/pricing?already_subscribed=1",
      );
    }
  });

  it("bounces canceled-but-paid-through subscribers (still Pro)", async () => {
    stubSub({
      status: "canceled",
      grace_until: null,
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const res = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(res.status, 302);
    assertEquals(res.headers.get("location"), "/pricing?already_subscribed=1");
  });

  it("bounces subscribers inside the grace window", async () => {
    stubSub({
      status: "past_due",
      grace_until: new Date(Date.now() + 86_400_000).toISOString(),
      current_period_end: null,
    });
    const res = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(res.status, 302);
    assertEquals(res.headers.get("location"), "/pricing?already_subscribed=1");
  });

  it("lets a dead subscription (lapsed period and grace) resubscribe", async () => {
    const past = "2026-01-01T00:00:00Z";
    stubSub({
      status: "canceled",
      grace_until: past,
      current_period_end: past,
    });
    const res = await handler.GET!(ctxFor({ id: "u1" }) as never);
    assertEquals(res.status, 302);
    assertEquals(
      res.headers.get("location")?.startsWith(
        "https://sandbox.polar.sh/checkout/polar_c_test?",
      ),
      true,
    );
  });
});
