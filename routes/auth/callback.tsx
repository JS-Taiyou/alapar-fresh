import { define } from "../../utils.ts";
import AuthCallback from "../../islands/AuthCallback.tsx";

export default define.page(function AuthCallbackPage(ctx) {
  const url = new URL(ctx.req.url);
  const redirectPath = url.searchParams.get("next") ?? "/dashboard";

  return <AuthCallback redirectPath={redirectPath} />;
});
