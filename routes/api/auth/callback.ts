import { define } from "../../../utils.ts";
import { setAuthCookies } from "../../../lib/supabase.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const accessToken = body.accessToken as string;
    const refreshToken = body.refreshToken as string;

    if (!accessToken || !refreshToken) {
      return Response.json({ error: "Missing tokens" }, { status: 400 });
    }

    const headers = new Headers();
    setAuthCookies(headers, accessToken, refreshToken);

    return Response.json({ ok: true }, { headers });
  },
});
