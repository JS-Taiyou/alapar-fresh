/**
 * Test-only stub for `lib/db.ts`.
 *
 * The real `lib/db.ts` throws at import time when `DATABASE_URL` is unset and
 * creates a live `pg.Pool`. Tests don't want either. This stub is wired in via
 * the `deno.test.json` import-map override (`"./lib/db.ts" → this file`) so
 * that every module imported during a test run gets a controllable `query()`
 * instead of a real database connection.
 *
 * Controlling the stub:
 *   - {@link __setQueryResult} — install the rows / rowCount the next `query()`
 *     calls should return. Pass a fixed result, or a function of
 *     `(text, params)` for per-query responses.
 *   - {@link __queryLog} — array recording every `(text, params)` call, for
 *     assertions about which queries ran and with what arguments.
 *   - {@link __resetDbStub} — clear log + result between tests.
 *
 * The default behavior (no result installed) returns empty rows, so tests that
 * never reach `query()` are unaffected.
 */

export interface QueryCall {
  text: string;
  params: unknown[];
}

export const __queryLog: QueryCall[] = [];

type ResultSpec =
  | { rows: Record<string, unknown>[]; rowCount?: number }
  | ((
    text: string,
    params: unknown[],
  ) => { rows: Record<string, unknown>[]; rowCount?: number });

let resultFn: ResultSpec = { rows: [] };

/**
 * Install what the stubbed `query()` should return.
 * Pass either a fixed result object, or a function of `(text, params)` for
 * per-call responses.
 */
export function __setQueryResult(
  spec: ResultSpec,
): void {
  resultFn = spec;
}

/** Clear the query log and reset the result to empty rows. */
export function __resetDbStub(): void {
  __queryLog.length = 0;
  resultFn = { rows: [] };
}

export function getPool() {
  // Tests never use the pool. Returning an empty object keeps the import
  // surface compatible with the real module without pulling in `pg`.
  return {} as unknown;
}

export function query(
  text: string,
  params?: unknown[],
): Promise<{
  // rows is `any[]` to match the real `pg` QueryResult, where callers assign
  // result.rows directly to typed arrays (e.g. `const subs: PushSubscription[] = result.rows`).
  // deno-lint-ignore no-explicit-any
  rows: any[];
  rowCount: number;
}> {
  __queryLog.push({ text, params: params ?? [] });
  const resolved = typeof resultFn === "function"
    ? resultFn(text, params ?? [])
    : resultFn;
  return Promise.resolve({
    rows: resolved.rows,
    rowCount: resolved.rowCount ?? resolved.rows.length,
  });
}
