/**
 * Tests for the entities collection route handler (POST validation + membership).
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { handler } from "./index.ts";
import { jsonRequest, makeCtx } from "../../../test/helpers.ts";
import {
  __resetDbStub,
  __setQueryResult,
} from "../../../test/fixtures/db_stub.ts";

const URL = "https://test.local/api/entities";

beforeEach(() => __resetDbStub());

describe("entities POST", () => {
  it("rejects a missing name with 400", async () => {
    const ctx = makeCtx({ req: jsonRequest(URL, { name: "" }) });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a whitespace-only name with 400", async () => {
    const ctx = makeCtx({ req: jsonRequest(URL, { name: "   " }) });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a request with no active registry and no registryId with 400", async () => {
    const ctx = makeCtx({
      req: jsonRequest(URL, { name: "Landlord" }),
      state: { activeRegistry: null, registries: [] },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 400);
  });

  it("rejects a non-member of the registry with 403", async () => {
    const ctx = makeCtx({
      req: jsonRequest(URL, { name: "Landlord", registryId: "r1" }),
      state: { registries: [{ id: "r2" } as never] },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 403);
  });

  it("creates an entity and returns 201 for a member", async () => {
    // createEntity → getEntities (SELECT entities_json) returns [] first,
    // then UPDATE; the stub returns a created-row shape.
    __setQueryResult(() => ({ rows: [] }));
    const ctx = makeCtx({
      req: jsonRequest(URL, {
        name: "Landlord",
        registryId: "r1",
        color: "#999",
      }),
      state: { registries: [{ id: "r1" } as never] },
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 201);
  });
});

describe("entities GET", () => {
  it("returns an empty list when no registryId is resolvable", async () => {
    const ctx = makeCtx({
      req: new Request(URL),
      state: { activeRegistry: null },
    });
    const res = await handler.GET!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), []);
  });
});
