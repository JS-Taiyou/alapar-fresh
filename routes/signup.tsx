import { define } from "../utils.ts";
import { getSupabaseAnonKey, getSupabaseUrl } from "../lib/supabase.ts";
import { type Locale, t as translate } from "../lib/i18n.ts";
import AuthForm from "../islands/AuthForm.tsx";
import AuthCardLayout from "../components/AuthCardLayout.tsx";

export default define.page(function Signup(ctx) {
  const locale: Locale = ctx.state.locale;
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params);

  return (
    <AuthCardLayout pageTitle={`A la par - ${t("auth.signup")}`}>
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center p-3 bg-primary rounded-custom mb-4">
          <svg
            class="h-8 w-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">{t("auth.signup")}</h1>
        <p class="text-zinc-400 text-sm mt-2">
          {t("auth.signup_subtitle")}
        </p>
      </div>
      <AuthForm
        mode="signup"
        locale={locale}
        supabaseUrl={getSupabaseUrl()}
        supabaseAnonKey={getSupabaseAnonKey()}
      />
    </AuthCardLayout>
  );
});
