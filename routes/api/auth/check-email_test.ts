/**
 * Tests for the check-email route handler (S13): the response shape is
 * uniform (`{ allowed }`, always 200) regardless of outcome, so probe
 * attempts can't be distinguished by error details.
 */
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { handler } from "./check-email.ts";
import { jsonRequest, makeCtx } from "../../../test/helpers.ts";
import {
  __resetDbStub,
  __setQueryResult,
} from "../../../test/fixtures/db_stub.ts";

const URL = "https://test.local/api/auth/check-email";

beforeEach(() => __resetDbStub());

describe("check-email POST", () => {
  it("returns { allowed: false } with 200 when the email is missing", async () => {
    const ctx = makeCtx({ req: jsonRequest(URL, {}) });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { allowed: false });
  });

  it("returns { allowed: false } with 200 for an invalid JSON body", async () => {
    const ctx = makeCtx({
      req: new Request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { allowed: false });
  });

  it("returns { allowed: false } for a non-allowlisted email", async () => {
    __setQueryResult(() => ({ rows: [] }));
    const ctx = makeCtx({ req: jsonRequest(URL, { email: "x@y.z" }) });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { allowed: false });
  });

  it("returns { allowed: true } for an allowlisted email", async () => {
    __setQueryResult(() => ({ rows: [{ "?": 1 }] }));
    const ctx = makeCtx({ req: jsonRequest(URL, { email: "x@y.z" }) });
    const res = await handler.POST!(ctx as never);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { allowed: true });
  });
});
