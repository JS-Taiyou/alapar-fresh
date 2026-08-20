/**
 * Test-only stub for `@supabase/supabase-js`.
 *
 * The real package requires node_modules (npm install), which CI can't do
 * due to the npm registry bug. Tests only exercise the pure exported
 * functions of the consumers (shouldRecover, constants, cookie helpers) —
 * they never call a real Supabase backend.
 *
 * This stub is also the TYPE environment that `deno test --config
 * deno.test.json` compiles `lib/supabase.ts` and `lib/realtime.ts` against
 * (via the import-map remap), so it must structurally provide every member
 * those files touch — kept as a permissive subset of the real API. When a
 * consumer starts using a new member, `deno task test` fails to type-check
 * with the member's name; add it here with a loose shape.
 */

export interface StubAuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}

export interface StubAuthError {
  message?: string;
}

export interface SupabaseClient {
  auth: {
    getUser(
      jwt?: string,
    ): Promise<{
      data: { user: StubAuthUser | null };
      error: StubAuthError | null;
    }>;
    refreshSession(refreshToken: {
      refresh_token: string;
    }): Promise<{
      data: {
        session: {
          access_token: string;
          refresh_token: string;
        } | null;
        user: StubAuthUser | null;
      };
      error: StubAuthError | null;
    }>;
  };
  realtime: {
    setAuth(token: string): Promise<void>;
  };
  channel(name: string): RealtimeChannel;
  removeChannel(
    channel: RealtimeChannel,
  ): Promise<"ok" | "timed out" | "error">;
}

export interface RealtimeChannel {
  on(
    event: string,
    filter: unknown,
    callback: (payload: {
      eventType: unknown;
      new: unknown;
      old: unknown;
    }) => void,
  ): RealtimeChannel;
  subscribe(
    callback: (status: string, err?: Error | null) => void,
  ): RealtimeChannel;
}

export function createClient(
  _url: string,
  _key: string,
  _options?: Record<string, unknown>,
): SupabaseClient {
  // Tests never reach a live backend; every method is an unreachable shim.
  return {} as SupabaseClient;
}
