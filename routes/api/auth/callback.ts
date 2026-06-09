import { define } from "../../../utils.ts";
import { setAuthCookies } from "../../../lib/supabase.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const accessToken = body.accessToken as string;
    const refreshToken = body.refreshToken as string;

    console.log("[AUTH-CB] POST received", {
      hasAccess: !!accessToken,
      hasRefresh: !!refreshToken,
      accessLen: accessToken?.length ?? 0,
      refreshLen: refreshToken?.length ?? 0,
      accessHead: accessToken?.substring(0, 30),
      refreshHead: refreshToken?.substring(0, 30),
      accessHasBadChars: /[,; \r\n]/.test(accessToken ?? ""),
      refreshHasBadChars: /[,; \r\n]/.test(refreshToken ?? ""),
      contentType: ctx.req.headers.get("content-type"),
    });

    if (!accessToken || !refreshToken) {
      return Response.json({ error: "Missing tokens" }, { status: 400 });
    }

    const headers = new Headers();
    setAuthCookies(headers, accessToken, refreshToken);

    const allSetCookie = headers.getSetCookie();
    console.log("[AUTH-CB] response Set-Cookie count:", allSetCookie.length);
    for (let i = 0; i < allSetCookie.length; i++) {
      console.log(
        `[AUTH-CB] Set-Cookie[${i}] (${allSetCookie[i].length} chars):`,
        allSetCookie[i].substring(0, 80) + (allSetCookie[i].length > 80 ? "..." : ""),
      );
    }

    return Response.json({ ok: true }, { headers });
  },
});
