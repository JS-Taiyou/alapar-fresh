/**
 * Test helpers for route-handler tests.
 *
 * Route handlers are plain functions: `handler.POST(ctx) -> Response`. They can
 * be invoked directly without starting a Fresh server. These helpers build the
 * minimal fake `ctx` the handlers read from (`ctx.state`, `ctx.req`,
 * `ctx.params`, `ctx.redirect`).
 *
 * Under `deno.test.json`, every `import { ... } from "../../lib/store.ts"`
 * (and anything else transitively pulling `lib/db.ts`) gets the stubbed
 * `query()`, so handler logic that reaches a store function is testable too.
 */
import type { State } from "../utils.ts";

/**
 * A minimal Fresh handler context. Cast to `any` at the call site because
 * Fresh's real `Context<State>` carries private fields and framework internals
 * the handlers in this app never touch.
 */
export interface FakeCtx {
  state: Partial<State>;
  req: Request;
  params: Record<string, string>;
  redirect: (url: string) => Response;
}

/** Default empty state; tests override the fields they care about. */
function defaultState(): Partial<State> {
  return {
    user: null,
    activeRegistry: null,
    registries: [],
    registryUsers: [],
    entities: [],
    participants: [],
    supabaseAuthId: null,
    isOwner: false,
    ownerRegistryIds: new Set<string>(),
  };
}

/**
 * Build a fake ctx. Pass `state` partials to override defaults (e.g.
 * `{ user: { id: "u1", ... }, isOwner: true }`), and/or a `params` object.
 */
export function makeCtx(opts: {
  state?: Partial<State>;
  req?: Request;
  params?: Record<string, string>;
} = {}): FakeCtx {
  return {
    state: { ...defaultState(), ...opts.state },
    req: opts.req ?? new Request("https://test.local/"),
    params: opts.params ?? {},
    redirect: (url: string) =>
      Response.redirect(new URL(url, "https://test.local"), 302),
  };
}

/** Build a JSON POST request with the given body. */
export function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Build a JSON DELETE request. */
export function jsonDelete(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Build a JSON PATCH request. */
export function jsonPatch(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Build a multipart/form-data request from a flat record. */
export function formRequest(
  url: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request(url, { method: "POST", headers, body: form });
}

/** Read a JSON response body (for assertions). */
export async function jsonBody(res: Response): Promise<unknown> {
  return await res.json();
}

/** A minimal user/participant object for state overrides. */
function user(id: string, name = id) {
  return {
    id,
    name,
    color: "#000",
    email: `${id}@x`,
    supabaseAuthId: null,
    createdAt: new Date(),
  };
}
export const mkUser = user;
export const mkParticipant = (id: string, name = id) => ({
  id,
  name,
  color: "#000",
});
