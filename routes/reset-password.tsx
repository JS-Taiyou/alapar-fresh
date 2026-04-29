import { define } from "../utils.ts";
import { getSupabaseAnonKey, getSupabaseUrl } from "../lib/supabase.ts";
import ResetPassword from "../islands/ResetPassword.tsx";
import AuthCardLayout from "../components/AuthCardLayout.tsx";

export default define.page(function ResetPasswordPage() {
  return (
    <AuthCardLayout pageTitle="A la par - Nueva Contraseña">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center p-3 bg-primary rounded-custom mb-4">
          <svg
            class="h-8 w-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">Nueva Contraseña</h1>
        <p class="text-slate-400 text-sm mt-2">
          Ingresa tu nueva contraseña
        </p>
      </div>

      <ResetPassword
        supabaseUrl={getSupabaseUrl()}
        supabaseAnonKey={getSupabaseAnonKey()}
      />
    </AuthCardLayout>
  );
});
