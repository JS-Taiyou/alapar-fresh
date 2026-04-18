import { useSignal } from "@preact/signals";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AuthFormProps {
  mode: "login" | "signup";
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export default function AuthForm(props: AuthFormProps) {
  const email = useSignal("");
  const password = useSignal("");
  const showPassword = useSignal(false);
  const name = useSignal("");
  const error = useSignal("");
  const successMessage = useSignal("");
  const loading = useSignal(false);

  const redirectParam = typeof globalThis.location !== "undefined"
    ? new URL(globalThis.location.href).searchParams.get("redirect")
    : null;
  const redirectPath = redirectParam ?? "/dashboard";

  let client: SupabaseClient;
  try {
    client = createClient(props.supabaseUrl, props.supabaseAnonKey);
  } catch {
    error.value = "Failed to initialize auth client";
    return <div class="text-red-400 text-center p-4">{error.value}</div>;
  }

  async function handleGoogleSignIn() {
    error.value = "";
    loading.value = true;
    try {
      const { error: oauthError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: globalThis.location.origin + "/auth/callback?next=" + encodeURIComponent(redirectPath),
        },
      });
      if (oauthError) {
        error.value = oauthError.message;
        loading.value = false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Error desconocido";
      loading.value = false;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error.value = "";
    loading.value = true;

    try {
      if (props.mode === "signup") {
        try {
          const res = await fetch("/api/auth/check-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.value }),
          });
          const data = await res.json();
          if (!data.allowed) {
            error.value = "Este email no está autorizado para registrarse.";
            loading.value = false;
            return;
          }
        } catch {
          error.value = "Error al verificar email.";
          loading.value = false;
          return;
        }
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.value,
          password: password.value,
          options: {
            data: { name: name.value },
            emailRedirectTo: globalThis.location.origin + redirectPath,
          },
        });
        if (signUpError) {
          error.value = signUpError.message;
          loading.value = false;
          return;
        }
        if (data.session) {
          await sendCallback(
            data.session.access_token,
            data.session.refresh_token,
          );
        } else {
          successMessage.value = "Revisa tu email para confirmar tu cuenta.";
          loading.value = false;
          return;
        }
      } else {
        const { data, error: signInError } = await client.auth
          .signInWithPassword({
            email: email.value,
            password: password.value,
          });
        if (signInError) {
          error.value = signInError.message;
          loading.value = false;
          return;
        }
        if (data.session) {
          await sendCallback(
            data.session.access_token,
            data.session.refresh_token,
          );
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Error desconocido";
      loading.value = false;
    }
  }

  async function sendCallback(accessToken: string, refreshToken: string) {
    try {
      const res = await fetch("/api/auth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, refreshToken }),
      });
      if (res.ok) {
        globalThis.location.href = redirectPath;
      } else {
        error.value = "Error al guardar la sesión";
        loading.value = false;
      }
    } catch {
      error.value = "Error de conexión";
      loading.value = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-5">
      {successMessage.value
        ? (
          <div class="text-sm text-blue-300 bg-blue-400/10 border border-blue-400/20 rounded-custom px-4 py-3 text-center">
            {successMessage.value}
          </div>
        )
        : (
          <>
            {props.mode === "signup" && (
              <div>
                <label
                  class="block text-sm font-medium text-slate-300 mb-1.5"
                  for="name"
                >
                  Nombre
                </label>
                <input
                  class="block w-full px-4 py-2.5 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
                  id="name"
                  type="text"
                  placeholder="Tu nombre"
                  value={name.value}
                  onInput={(e) =>
                    name.value = (e.target as HTMLInputElement).value}
                  required
                />
              </div>
            )}
            <div>
              <label
                class="block text-sm font-medium text-slate-300 mb-1.5"
                for="email"
              >
                Email
              </label>
              <input
                class="block w-full px-4 py-2.5 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email.value}
                onInput={(e) =>
                  email.value = (e.target as HTMLInputElement).value}
                required
              />
            </div>
            <div>
              <label
                class="block text-sm font-medium text-slate-300 mb-1.5"
                for="password"
              >
                Contraseña
              </label>
              <div class="relative">
                <input
                  class="block w-full px-4 py-2.5 pr-11 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
                  id="password"
                  type={showPassword.value ? "text" : "password"}
                  placeholder="••••••••"
                  value={password.value}
                  onInput={(e) =>
                    password.value = (e.target as HTMLInputElement).value}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  onClick={() => showPassword.value = !showPassword.value}
                  tabIndex={-1}
                  aria-label={showPassword.value
                    ? "Ocultar contraseña"
                    : "Mostrar contraseña"}
                >
                  {showPassword.value
                    ? (
                      <svg
                        class="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18"
                        />
                      </svg>
                    )
                    : (
                      <svg
                        class="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                </button>
              </div>
            </div>

            {error.value && (
              <div class="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-custom px-4 py-2">
                {error.value}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading.value}
              class="w-full py-3 bg-white/5 hover:bg-white/10 border border-border-custom text-white font-medium rounded-custom transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {loading.value ? "Cargando..." : "Continuar con Google"}
            </button>

            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-border-custom" />
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="bg-surface px-3 text-slate-500">o</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading.value}
              class="w-full py-3 bg-primary hover:bg-primary-light text-white font-semibold rounded-custom transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              {loading.value
                ? "Cargando..."
                : props.mode === "login"
                ? "Iniciar Sesión"
                : "Crear Cuenta"}
            </button>
          </>
        )}

      {props.mode === "login" && (
        <p class="text-center text-sm">
          <a
            href="/forgot-password"
            class="text-slate-400 hover:text-primary hover:underline"
          >
            Olvidaste tu contraseña?
          </a>
        </p>
      )}

      <p class="text-center text-sm text-slate-400">
        {props.mode === "login"
          ? (
            <>
              No tienes cuenta?{" "}
              <a
                href={`/signup${
                  redirectParam
                    ? `?redirect=${encodeURIComponent(redirectParam)}`
                    : ""
                }`}
                class="text-primary hover:underline"
              >
                Regístrate
              </a>
            </>
          )
          : (
            <>
              Ya tienes cuenta?{" "}
              <a
                href={`/login${
                  redirectParam
                    ? `?redirect=${encodeURIComponent(redirectParam)}`
                    : ""
                }`}
                class="text-primary hover:underline"
              >
                Inicia sesión
              </a>
            </>
          )}
      </p>
    </form>
  );
}
