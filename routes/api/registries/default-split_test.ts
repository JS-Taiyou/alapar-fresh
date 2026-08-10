/**
 * Tests for the default-split route handler.
 *
 * Covers the pre-DB validation logic: body presence, the isOwner gate, the
 * percentage-sum check (±0.01 threshold), and participant-membership
 * validation. The store calls (`setDefaultSplit`/`clearDefaultSplit`) run
 * against the stubbed query, so the happy paths are exercised too.
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { handler } from "./default-split.ts";
import {
  jsonDelete,
  jsonRequest,
  makeCtx,
  mkParticipant,
} from "../../../test/helpers.ts";
import {
  __queryLog,
  __resetDbStub,
  __setQueryResult,
} from "../../../test/fixtures/db_stub.ts";

const URL = "https://test.local/api/registries/default-split";
const participants = [
  mkParticipant("u1", "Alice"),
  mkParticipant("u2", "Bob"),
  mkParticipant("u3", "Carol"),
];

function ownerCtx(req: Request) {
  return makeCtx({
    req,
    state: { user: { id: "u1" } as never, isOwner: true, participants },
  });
}

function memberCtx(req: Request) {
  return makeCtx({
    req,
    state: { user: { id: "u2" } as never, isOwner: false, participants },
  });
}

beforeEach(() => __resetDbStub());

describe("default-split POST", () => {
  it("rejects an invalid body (missing registryId) with 400", async () => {
    const ctx = ownerCtx(jsonRequest(URL, { splits: [] }));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a non-owner with 403", async () => {
    const ctx = memberCtx(
      jsonRequest(URL, {
        registryId: "r1",
        splits: [{ userId: "u1", percentage: 100 }],
      }),
    );
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 403);
  });

  it("rejects splits that don't sum to 100 (off by 1) with 400", async () => {
    const ctx = ownerCtx(
      jsonRequest(URL, {
        registryId: "r1",
        splits: [{ userId: "u1", percentage: 99 }],
      }),
    );
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("accepts splits that sum to 100 within the 0.01 tolerance", async () => {
    // setDefaultSplit → getRegistryMemberCount expects rows[0].cnt.
    __setQueryResult(() => ({ rows: [{ cnt: "3" }] }));
    // 33.33 + 33.33 + 33.34 = 100.00 — within tolerance.
    const ctx = ownerCtx(
      jsonRequest(URL, {
        registryId: "r1",
        splits: [
          { userId: "u1", percentage: 33.33 },
          { userId: "u2", percentage: 33.33 },
          { userId: "u3", percentage: 33.34 },
        ],
      }),
    );
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
  });

  it("rejects a split referencing a user not in participants with 400", async () => {
    const ctx = ownerCtx(
      jsonRequest(URL, {
        registryId: "r1",
        splits: [{ userId: "u-unknown", percentage: 100 }],
      }),
    );
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("accepts a valid owner request with percentages summing to 100", async () => {
    __setQueryResult(() => ({ rows: [{ cnt: "3" }] }));
    const ctx = ownerCtx(
      jsonRequest(URL, {
        registryId: "r1",
        splits: [
          { userId: "u1", percentage: 50 },
          { userId: "u2", percentage: 30 },
          { userId: "u3", percentage: 20 },
        ],
      }),
    );
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true });
  });
});

describe("default-split DELETE", () => {
  it("rejects a non-owner with 403", async () => {
    const ctx = memberCtx(jsonDelete(URL, { registryId: "r1" }));
    const res = await handler.DELETE!(ctx as never);
    assertEquals(res.status, 403);
  });

  it("clears the split for an owner and returns ok", async () => {
    const ctx = ownerCtx(jsonDelete(URL, { registryId: "r1" }));
    const res = await handler.DELETE!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true });
  });
});
