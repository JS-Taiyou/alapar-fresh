import { define } from "../utils.ts";
import { getSupabaseAnonKey, getSupabaseUrl } from "../lib/supabase.ts";
import AuthForm from "../islands/AuthForm.tsx";
import AuthCardLayout from "../components/AuthCardLayout.tsx";

export default define.page(function Login(ctx) {
  const url = new URL(ctx.req.url);
  const errorMsg = url.searchParams.get("error");

  return (
    <AuthCardLayout pageTitle="A la par - Iniciar Sesión">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center p-3 bg-primary rounded-custom mb-4">
          <svg
            class="h-8 w-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">Iniciar Sesión</h1>
        <p class="text-slate-400 text-sm mt-2">
          Ingresa a tu cuenta de A la par
        </p>
      </div>

      {errorMsg === "unauthorized" && (
        <div class="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-custom px-4 py-2 mb-4">
          Tu email no está autorizado para usar esta aplicación.
        </div>
      )}

      <AuthForm
        mode="login"
        supabaseUrl={getSupabaseUrl()}
        supabaseAnonKey={getSupabaseAnonKey()}
      />
    </AuthCardLayout>
  );
});
