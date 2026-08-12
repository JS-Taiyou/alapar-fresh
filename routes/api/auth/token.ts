import { define } from "../../../utils.ts";

/**
 * GET /api/auth/token
 *
 * Returns the current Supabase access token for the client-side realtime
 * channel. The client can't read the token directly (it's in an HttpOnly
 * cookie), and the token it received at SSR becomes stale after ~1h (JWT
 * expiry). This endpoint is the refresh seam: the middleware has already
 * validated/refreshed the token by the time this runs and stashed it on
 * `ctx.state.accessToken`, so we serve that instead of re-validating with
 * possibly-spent cookies.
 *
 * Used by `lib/realtime.ts` to recover a channel after a token-expiry error.
 */
export const handler = define.handlers({
  GET(ctx) {
    if (!ctx.state.supabaseAuthId || !ctx.state.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json({ accessToken: ctx.state.accessToken });
  },
});
