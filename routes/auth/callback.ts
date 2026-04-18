import { define } from "../../utils.ts";
import { createServerClient, setAuthCookies } from "../../lib/supabase.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.req.url);
    const code = url.searchParams.get("code");
    const redirectPath = url.searchParams.get("next") ?? "/dashboard";

    if (!code) {
      return ctx.redirect("/login?error=auth");
    }

    const client = createServerClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      return ctx.redirect("/login?error=auth");
    }

    const headers = new Headers();
    setAuthCookies(
      headers,
      data.session.access_token,
      data.session.refresh_token,
    );
    headers.set("Location", redirectPath);

    return new Response(null, {
      status: 302,
      headers,
    });
  },
});
