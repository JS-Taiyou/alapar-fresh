import { define } from "../../utils.ts";
import AuthCallback from "../../islands/AuthCallback.tsx";
import { getSupabaseAnonKey, getSupabaseUrl } from "../../lib/supabase.ts";

export default define.page(function AuthCallbackPage(ctx) {
  const url = new URL(ctx.req.url);
  const next = url.searchParams.get("next");
  // Open-redirect guard: only relative same-origin paths are honored.
  const redirectPath = next && /^\/(?!\/)/.test(next) ? next : "/dashboard";

  return (
    <AuthCallback
      redirectPath={redirectPath}
      supabaseUrl={getSupabaseUrl()}
      supabaseAnonKey={getSupabaseAnonKey()}
    />
  );
});
