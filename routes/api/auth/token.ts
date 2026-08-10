import { define } from "../../../utils.ts";
import { getCookie } from "../../../lib/auth-cookies.ts";
import { getUserFromRequest } from "../../../lib/supabase.ts";

/**
 * GET /api/auth/token
 *
 * Returns the current Supabase access token for the client-side realtime
 * channel. The client can't read the token directly (it's in an HttpOnly
 * cookie), and the token it received at SSR becomes stale after ~1h (JWT
 * expiry). This endpoint is the refresh seam: the middleware has already
 * validated/refreshed the token by the time this runs, so we return whichever
 * token is current.
 *
 * Used by `lib/realtime.ts` to recover a channel after a token-expiry error.
 */
export const handler = define.handlers({
  async GET(ctx) {
    const authResult = await getUserFromRequest(ctx.req);
    if (!authResult) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If the middleware refreshed the token, use the new one; otherwise the
    // cookie token is still valid.
    const accessToken = authResult.refreshedTokens?.accessToken ??
      getCookie(ctx.req.headers.get("cookie") ?? "", "sb-access-token");

    if (!accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json({ accessToken });
  },
});
