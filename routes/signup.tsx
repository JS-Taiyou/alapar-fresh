import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { getSupabaseAnonKey, getSupabaseUrl } from "../lib/supabase.ts";
import AuthForm from "../islands/AuthForm.tsx";

export default define.page(function Signup() {
  return (
    <>
      <Head>
        <title>A la par - Crear Cuenta</title>
      </Head>
      <main class="min-h-screen flex items-center justify-center p-6 bg-pattern">
        <div class="absolute inset-0 gradient-glow pointer-events-none" />
        <div class="bg-surface border border-border-custom rounded-custom p-8 w-full max-w-md z-10">
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
            <h1 class="text-2xl font-bold text-white">Crear Cuenta</h1>
            <p class="text-slate-400 text-sm mt-2">
              Regístrate para empezar a dividir gastos
            </p>
          </div>
          <AuthForm
            mode="signup"
            supabaseUrl={getSupabaseUrl()}
            supabaseAnonKey={getSupabaseAnonKey()}
          />
        </div>
      </main>
    </>
  );
});
