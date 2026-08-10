/**
 * Tests for the single-registry route handler (PATCH rename, DELETE with the
 * transaction-count guard).
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { handler } from "./[id].ts";
import { jsonDelete, jsonPatch, makeCtx } from "../../../test/helpers.ts";
import {
  __resetDbStub,
  __setQueryResult,
} from "../../../test/fixtures/db_stub.ts";

const URL = "https://test.local/api/registries/r1";

function memberCtx(req: Request) {
  return makeCtx({
    req,
    params: { id: "r1" },
    state: {
      user: { id: "u1" } as never,
      registries: [{ id: "r1" } as never],
    },
  });
}

beforeEach(() => __resetDbStub());

describe("registry PATCH (rename)", () => {
  it("returns 401 when there is no user", async () => {
    const ctx = makeCtx({
      req: jsonPatch(URL, { name: "X" }),
      params: { id: "r1" },
      state: { user: null, registries: [{ id: "r1" } as never] },
    });
    const res = await handler.PATCH!(ctx as never);
    assertEquals(res.status, 401);
  });

  it("returns 403 when the user is not a member of the registry", async () => {
    const ctx = makeCtx({
      req: jsonPatch(URL, { name: "X" }),
      params: { id: "r1" },
      state: {
        user: { id: "u1" } as never,
        registries: [{ id: "r2" } as never],
      },
    });
    const res = await handler.PATCH!(ctx as never);
    assertEquals(res.status, 403);
  });

  it("returns 400 when the name is missing or blank", async () => {
    const ctx = memberCtx(jsonPatch(URL, { name: "   " }));
    const res = await handler.PATCH!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("renames and returns 200 when the member and registry exist", async () => {
    // renameRegistry → isMemberOfRegistry (row) + UPDATE RETURNING * (row).
    __setQueryResult(() => ({
      rows: [{
        id: "r1",
        name: "New",
        is_default: false,
        latest_accessed: "2024-01-01",
        default_split_json: null,
        default_split_member_count: null,
        last_modified: null,
      }],
    }));
    const ctx = memberCtx(jsonPatch(URL, { name: "New Name" }));
    const res = await handler.PATCH!(ctx as never);
    assertEquals(res.status, 200);
  });
});

describe("registry DELETE", () => {
  it("returns 401 when there is no user", async () => {
    const ctx = makeCtx({
      req: jsonDelete(URL, {}),
      params: { id: "r1" },
      state: { user: null, registries: [{ id: "r1" } as never] },
    });
    const res = await handler.DELETE!(ctx as never);
    assertEquals(res.status, 401);
  });

  it("returns 403 when the user is not a member", async () => {
    const ctx = makeCtx({
      req: jsonDelete(URL, {}),
      params: { id: "r1" },
      state: {
        user: { id: "u1" } as never,
        registries: [{ id: "r2" } as never],
      },
    });
    const res = await handler.DELETE!(ctx as never);
    assertEquals(res.status, 403);
  });

  it("returns 409 when the registry has transactions", async () => {
    // getTransactionCount returns cnt > 0.
    __setQueryResult(() => ({ rows: [{ cnt: "5" }] }));
    const ctx = memberCtx(jsonDelete(URL, {}));
    const res = await handler.DELETE!(ctx as never);
    assertEquals(res.status, 409);
  });
});
