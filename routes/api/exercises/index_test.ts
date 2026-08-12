/**
 * Tests for the exercises collection route handler.
 *
 * The POST handler is the most branchy in the app: it sniffs content-type,
 * branches on the Accept header (JSON error vs redirect), requires OWNERSHIP
 * of the target registry (S8 — closing an exercise is destructive),
 * short-circuits when there are no active transactions, and decides whether
 * to emit balance "ajuste" transactions based on a rounding threshold
 * (`totalPending > 0.01 * active.length`).
 *
 * These tests focus on the pre-DB validation/branching and the empty-active
 * short-circuit. The full createExercise + ajuste flow is heavy on store
 * orchestration and is better covered by an integration test.
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { handler } from "./index.ts";
import { jsonRequest, makeCtx } from "../../../test/helpers.ts";
import {
  __resetDbStub,
  __setQueryResult,
} from "../../../test/fixtures/db_stub.ts";

const URL = "https://test.local/api/exercises";

beforeEach(() => __resetDbStub());

describe("exercises POST — auth & body parsing", () => {
  it("redirects to /dashboard when there is no user and the client doesn't accept JSON", async () => {
    const ctx = makeCtx({
      req: new Request(URL, { method: "POST" }),
      state: { user: null, activeRegistry: null },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 302);
    // Response.redirect produces an absolute URL.
    assertEquals(res.headers.get("location"), "https://test.local/dashboard");
  });

  it("returns 401 JSON when there is no user and the client accepts JSON", async () => {
    const ctx = makeCtx({
      req: new Request(URL, {
        method: "POST",
        headers: { Accept: "application/json" },
      }),
      state: { user: null, activeRegistry: null },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 401);
  });

  it("returns a 400 JSON error when the body is declared JSON but fails to parse", async () => {
    const ctx = makeCtx({
      req: new Request(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: "not valid json",
      }),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
      },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("redirects to /dashboard when JSON parsing fails and the client doesn't accept JSON", async () => {
    const ctx = makeCtx({
      req: new Request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      }),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
      },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 302);
  });
});

describe("exercises POST — ownership gate (S8)", () => {
  it("returns 403 JSON when the requested registry isn't owned by the user", async () => {
    const ctx = makeCtx({
      req: jsonRequest(URL, { registryId: "r-other" }, {
        Accept: "application/json",
      }),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
        registries: [{ id: "r1" } as never],
        ownerRegistryIds: new Set(["r1"]),
      },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 403);
  });

  it("returns 403 JSON when the user is a member of the ACTIVE registry but not its owner", async () => {
    const ctx = makeCtx({
      req: jsonRequest(URL, {}, { Accept: "application/json" }),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
        registries: [{ id: "r1" } as never],
        isOwner: false,
        ownerRegistryIds: new Set<string>(),
      },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 403);
  });

  it("redirects when the ownership check fails and the client doesn't accept JSON", async () => {
    const ctx = makeCtx({
      req: jsonRequest(URL, { registryId: "r-other" }),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
        registries: [{ id: "r1" } as never],
        ownerRegistryIds: new Set(["r1"]),
      },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 302);
  });
});

describe("exercises POST — empty active short-circuit", () => {
  it("returns JSON with null exercise when there are no active transactions", async () => {
    // getActiveTransactions returns [].
    __setQueryResult({ rows: [] });
    const ctx = makeCtx({
      req: jsonRequest(URL, {}, { Accept: "application/json" }),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
        registries: [{ id: "r1" } as never],
        ownerRegistryIds: new Set(["r1"]),
      },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { exercise: null, transactions: [] });
  });

  it("proceeds for an owned non-active registry (empty active → null exercise)", async () => {
    // Owner of both registries requesting a close on the non-active one.
    __setQueryResult({ rows: [] });
    const ctx = makeCtx({
      req: jsonRequest(URL, { registryId: "r2" }, {
        Accept: "application/json",
      }),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
        registries: [{ id: "r1" } as never, { id: "r2" } as never],
        ownerRegistryIds: new Set(["r1", "r2"]),
      },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { exercise: null, transactions: [] });
  });

  it("redirects when active is empty and the client doesn't accept JSON", async () => {
    __setQueryResult({ rows: [] });
    const ctx = makeCtx({
      req: jsonRequest(URL, {}),
      state: {
        user: { id: "u1" } as never,
        activeRegistry: { id: "r1" } as never,
        registries: [{ id: "r1" } as never],
        ownerRegistryIds: new Set(["r1"]),
      },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 302);
  });
});

describe("exercises GET", () => {
  it("returns an empty exercises list when there is no active registry", async () => {
    const ctx = makeCtx({
      req: new Request(URL),
      state: { activeRegistry: null },
    });
    const res = await handler.GET!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { exercises: [] });
  });
});
