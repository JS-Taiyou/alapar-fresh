/**
 * Test-only stub for `@supabase/supabase-js`.
 *
 * The real package requires node_modules (npm install), which CI can't do
 * due to the npm registry bug. The realtime tests only need the pure
 * exported functions (shouldRecover, constants) — they never call
 * createClient. This stub provides empty shims so the module loads.
 */

export function createClient(): unknown {
  return {};
}

export type SupabaseClient = unknown;
export type RealtimeChannel = unknown;
