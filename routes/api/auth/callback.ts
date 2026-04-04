import { define } from "../../../utils.ts";
import { setAuthCookies } from "../../../lib/supabase.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const accessToken = body.accessToken as string;
    const refreshToken = body.refreshToken as string;

    if (!accessToken || !refreshToken) {
      return new Response(JSON.stringify({ error: "Missing tokens" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const headers = new Headers();
    setAuthCookies(headers, accessToken, refreshToken);
    headers.set("Content-Type", "application/json");

    return new Response(JSON.stringify({ ok: true }), { headers });
  },
});
