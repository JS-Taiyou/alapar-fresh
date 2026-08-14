/**
 * Tests for lib/entitlements.ts against the db stub.
 *
 * Covers: plan resolution (free / pro column / grandfathered / subscription
 * states incl. past_due grace), limit sets, and the count helpers.
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  countActiveTemplates,
  countOwnedRegistries,
  countRegistryMembers,
  entitlementsFor,
  FREE_LIMITS,
  getRegistryPlan,
  UNLIMITED,
} from "./entitlements.ts";
import {
  __queryLog,
  __resetDbStub,
  __setQueryResult,
} from "../test/fixtures/db_stub.ts";

beforeEach(() => __resetDbStub());

// ---------------------------------------------------------------------------
// entitlementsFor — pure limit mapping
// ---------------------------------------------------------------------------

describe("entitlementsFor", () => {
  it("free → FREE_LIMITS", () => {
    assertEquals(entitlementsFor("free"), FREE_LIMITS);
    assertEquals(FREE_LIMITS.maxOwnedRegistries, 2);
    assertEquals(FREE_LIMITS.maxMembers, 4);
    assertEquals(FREE_LIMITS.maxActiveTemplates, 3);
    assertEquals(FREE_LIMITS.maxClosedExercisesVisible, 1);
  });

  it("pro → unlimited", () => {
    assertEquals(entitlementsFor("pro"), UNLIMITED);
    assertEquals(UNLIMITED.maxMembers, Infinity);
  });

  it("grandfathered → unlimited", () => {
    assertEquals(entitlementsFor("grandfathered"), UNLIMITED);
  });
});

// ---------------------------------------------------------------------------
// getRegistryPlan — the resolution matrix
// ---------------------------------------------------------------------------

describe("getRegistryPlan", () => {
  it("returns null when the registry doesn't exist", async () => {
    __setQueryResult({ rows: [] });
    assertEquals(await getRegistryPlan("r-missing"), null);
  });

  it("free plan with no subscription → free limits", async () => {
    __setQueryResult({
      rows: [{ plan: "free", sub_status: null, grace_until: null }],
    });
    const info = await getRegistryPlan("r1");
    assertEquals(info!.plan, "free");
    assertEquals(info!.isPro, false);
    assertEquals(info!.limits, FREE_LIMITS);
  });

  it("pro column → unlimited regardless of subscription", async () => {
    __setQueryResult({
      rows: [{ plan: "pro", sub_status: "canceled", grace_until: null }],
    });
    const info = await getRegistryPlan("r1");
    assertEquals(info!.isPro, true);
  });

  it("grandfathered column → unlimited", async () => {
    __setQueryResult({
      rows: [{ plan: "grandfathered", sub_status: null, grace_until: null }],
    });
    const info = await getRegistryPlan("r1");
    assertEquals(info!.isPro, true);
    assertEquals(info!.plan, "grandfathered");
  });

  it("free column + active subscription → effective pro (webhook-lag cover)", async () => {
    __setQueryResult({
      rows: [{ plan: "free", sub_status: "active", grace_until: null }],
    });
    const info = await getRegistryPlan("r1");
    assertEquals(info!.isPro, true);
  });

  it("free column + trialing subscription → effective pro", async () => {
    __setQueryResult({
      rows: [{ plan: "free", sub_status: "trialing", grace_until: null }],
    });
    assertEquals((await getRegistryPlan("r1"))!.isPro, true);
  });

  it("past_due within grace → still pro", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    __setQueryResult({
      rows: [{ plan: "free", sub_status: "past_due", grace_until: future }],
    });
    assertEquals((await getRegistryPlan("r1"))!.isPro, true);
  });

  it("past_due after grace → back to free", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    __setQueryResult({
      rows: [{ plan: "free", sub_status: "past_due", grace_until: past }],
    });
    assertEquals((await getRegistryPlan("r1"))!.isPro, false);
  });

  it("canceled subscription outside grace → free", async () => {
    __setQueryResult({
      rows: [{ plan: "free", sub_status: "canceled", grace_until: null }],
    });
    assertEquals((await getRegistryPlan("r1"))!.isPro, false);
  });
});

// ---------------------------------------------------------------------------
// Count helpers — SQL shape verification via the query log
// ---------------------------------------------------------------------------

describe("count helpers", () => {
  it("countOwnedRegistries counts owner rows", async () => {
    __setQueryResult({ rows: [{ cnt: 2 }] });
    assertEquals(await countOwnedRegistries("u1"), 2);
    assertEquals(__queryLog[0].text.includes("role = 'owner'"), true);
  });

  it("countRegistryMembers counts membership rows", async () => {
    __setQueryResult({ rows: [{ cnt: 4 }] });
    assertEquals(await countRegistryMembers("r1"), 4);
  });

  it("countActiveTemplates counts distinct groups, excludes paid-off and disabled", async () => {
    __setQueryResult({ rows: [{ cnt: 3 }] });
    assertEquals(await countActiveTemplates("r1"), 3);
    const sql = __queryLog[0].text;
    assertEquals(sql.includes("recurring_disabled = false"), true);
    assertEquals(
      sql.includes("installment_current < installment_total"),
      true,
    );
  });
});
