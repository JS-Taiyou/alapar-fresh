/**
 * Compile-time drift guard for `test/fixtures/db_stub.ts`.
 *
 * The test import map (`deno.test.json`) redirects `./lib/db.ts` to the stub
 * — including for modules that were written against the REAL module. Nothing
 * enforced that the stub keeps up: when `lib/db.ts` gained `withTransaction`,
 * the stub silently lacked it and only an accidental non-`--no-check` run
 * caught it. This file makes the contract checkable.
 *
 * How it works:
 *   - Under `deno.check.jsonc` (`deno task check:types`) there is NO remap,
 *     so `RealDb` below is the real module and the assertion demands the
 *     stub export everything it does.
 *   - Under `deno.test.json` the remap makes both sides the stub itself, so
 *     the comparison is trivially true and test runs are unaffected.
 */
import type * as RealDb from "../../lib/db.ts";
import type * as DbStub from "./db_stub.ts";

type RealExports = keyof typeof RealDb;
type StubExports = keyof typeof DbStub;
type MissingFromStub = Exclude<RealExports, StubExports>;
type _StubCoversReal = [MissingFromStub] extends [never] ? unknown
  : `db_stub is missing exports: ${Extract<
    MissingFromStub,
    string
  >} (mirrored from lib/db.ts)`;

const _assertStubCoversReal: _StubCoversReal = undefined;
