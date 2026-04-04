import { define } from "../../../utils.ts";
import { clearAuthCookies } from "../../../lib/supabase.ts";

export const handlers = define.handlers({
  POST(_ctx) {
    const headers = new Headers();
    clearAuthCookies(headers);
    headers.set("Location", "/login");
    return new Response(null, { status: 302, headers });
  },
});
