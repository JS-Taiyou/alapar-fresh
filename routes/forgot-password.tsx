import { define } from "../utils.ts";
import { getSupabaseAnonKey, getSupabaseUrl } from "../lib/supabase.ts";
import ForgotPassword from "../islands/ForgotPassword.tsx";
import AuthCardLayout from "../components/AuthCardLayout.tsx";

export default define.page(function ForgotPasswordPage() {
  return (
    <AuthCardLayout pageTitle="A la par - Recuperar Contraseña">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center p-3 bg-primary rounded-custom mb-4">
          <svg
            class="h-8 w-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">Recuperar Contraseña</h1>
        <p class="text-zinc-400 text-sm mt-2">
          Ingresa tu email y te enviaremos un enlace para restablecerla
        </p>
      </div>

      <ForgotPassword
        supabaseUrl={getSupabaseUrl()}
        supabaseAnonKey={getSupabaseAnonKey()}
      />
    </AuthCardLayout>
  );
});
