import { define } from "../../../utils.ts";
import { clearAuthCookies } from "../../../lib/supabase.ts";

export const handler = define.handlers({
  POST(ctx) {
    const headers = new Headers();
    clearAuthCookies(headers);

    const accept = ctx.req.headers.get("Accept") ?? "";
    if (accept.includes("application/json")) {
      headers.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    headers.set("Location", "/login");
    return new Response(null, { status: 302, headers });
  },
});
