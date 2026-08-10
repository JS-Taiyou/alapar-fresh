/**
 * Tests for the transactions collection route handler.
 *
 * Focuses on the POST field-validation matrix (all the 400/401 paths that run
 * before createTransaction) and the GET ETag 304 short-circuit. The store
 * calls run against the stubbed query.
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { handler } from "./index.ts";
import { formRequest, makeCtx, mkParticipant } from "../../../test/helpers.ts";
import {
  __resetDbStub,
  __setQueryResult,
} from "../../../test/fixtures/db_stub.ts";

const URL = "https://test.local/api/transactions";
const participants = [mkParticipant("u1"), mkParticipant("u2")];

function userCtx(req: Request) {
  return makeCtx({
    req,
    state: {
      user: { id: "u1" } as never,
      activeRegistry: { id: "r1", name: "R" } as never,
      participants,
    },
  });
}

function anonCtx(req: Request) {
  return makeCtx({ req, state: { user: null } });
}

function validFields(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    description: "Dinner",
    amount: "100",
    userPaid: "u1",
    registryId: "r1",
    splitJson: JSON.stringify({
      splits: [{ userId: "u1", percentage: 100, amount: 100 }],
    }),
    ...overrides,
  };
}

beforeEach(() => __resetDbStub());

describe("transactions POST — auth", () => {
  it("returns 401 when there is no user", async () => {
    const ctx = anonCtx(formRequest(URL, validFields()));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 401);
  });
});

describe("transactions POST — field validation", () => {
  it("rejects a missing description with 400", async () => {
    const ctx = userCtx(formRequest(URL, validFields({ description: "" })));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a whitespace-only description with 400", async () => {
    const ctx = userCtx(formRequest(URL, validFields({ description: "   " })));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a missing amount with 400", async () => {
    const ctx = userCtx(formRequest(URL, validFields({ amount: "" })));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a non-numeric amount with 400", async () => {
    const ctx = userCtx(formRequest(URL, validFields({ amount: "abc" })));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects Infinity from a huge amount with 400", async () => {
    const ctx = userCtx(formRequest(URL, validFields({ amount: "Infinity" })));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a missing userPaid with 400", async () => {
    const ctx = userCtx(formRequest(URL, validFields({ userPaid: "" })));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a missing registryId with 400", async () => {
    const ctx = userCtx(formRequest(URL, validFields({ registryId: "" })));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects an invalid transactionPayments JSON with 400", async () => {
    const ctx = userCtx(
      formRequest(URL, validFields({ transactionPayments: "not-json" })),
    );
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects an invalid splitJson with 400", async () => {
    const ctx = userCtx(
      formRequest(URL, validFields({ splitJson: "not-json" })),
    );
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });
});

describe("transactions POST — happy path", () => {
  it("creates a transaction and returns 200 when membership check passes", async () => {
    // createTransaction → isMemberOfRegistry (expects a row), then INSERT RETURNING *.
    __setQueryResult(() => ({ rows: [{ id: "tx-new" }] }));
    const ctx = userCtx(formRequest(URL, validFields()));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
  });

  it("returns 403 when the user is not a member of the registry", async () => {
    // isMemberOfRegistry returns 0 rows → createTransaction returns null → 403.
    __setQueryResult({ rows: [] });
    const ctx = userCtx(formRequest(URL, validFields()));
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 403);
  });
});

describe("transactions GET", () => {
  it("returns an empty list when there is no active registry", async () => {
    const ctx = makeCtx({
      req: new Request(URL),
      state: { activeRegistry: null },
    });
    const res = await handler.GET!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { transactions: [] });
  });

  it("returns 304 when If-None-Match matches the generated ETag", async () => {
    // First request to capture the ETag, then replay it.
    __setQueryResult(() => ({ rows: [] }));
    const ctx1 = makeCtx({
      req: new Request(URL),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
        participants,
      },
    });
    const res1 = await handler.GET!(ctx1 as never);
    const etag = res1.headers.get("ETag")!;

    const ctx2 = makeCtx({
      req: new Request(URL, { headers: { "If-None-Match": etag } }),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
        participants,
      },
    });
    const res2 = await handler.GET!(ctx2 as never);
    assertEquals(res2.status, 304);
  });
});
