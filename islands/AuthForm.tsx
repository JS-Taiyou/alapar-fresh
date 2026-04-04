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
  const name = useSignal("");
  const error = useSignal("");
  const loading = useSignal(false);

  let client: SupabaseClient;
  try {
    client = createClient(props.supabaseUrl, props.supabaseAnonKey);
  } catch {
    error.value = "Failed to initialize auth client";
    return <div class="text-red-400 text-center p-4">{error.value}</div>;
  }

  const ALLOWED_EMAILS = ["jpsb23@gmail.com", "itzapicm@gmail.com"];

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error.value = "";
    loading.value = true;

    try {
      if (props.mode === "signup") {
        if (!ALLOWED_EMAILS.includes(email.value)) {
          error.value = "Este email no está autorizado para registrarse.";
          loading.value = false;
          return;
        }
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.value,
          password: password.value,
          options: {
            data: { name: name.value },
            emailRedirectTo: globalThis.location.origin + "/api/auth/callback",
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
          error.value = "Revisa tu email para confirmar tu cuenta.";
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
        globalThis.location.href = "/dashboard";
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
            onInput={(e) => name.value = (e.target as HTMLInputElement).value}
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
          onInput={(e) => email.value = (e.target as HTMLInputElement).value}
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
        <input
          class="block w-full px-4 py-2.5 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
          id="password"
          type="password"
          placeholder="••••••••"
          value={password.value}
          onInput={(e) => password.value = (e.target as HTMLInputElement).value}
          minLength={6}
          required
        />
      </div>

      {error.value && (
        <div class="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-custom px-4 py-2">
          {error.value}
        </div>
      )}

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

      <p class="text-center text-sm text-slate-400">
        {props.mode === "login"
          ? (
            <>
              No tienes cuenta?{" "}
              <a href="/signup" class="text-primary hover:underline">
                Regístrate
              </a>
            </>
          )
          : (
            <>
              Ya tienes cuenta?{" "}
              <a href="/login" class="text-primary hover:underline">
                Inicia sesión
              </a>
            </>
          )}
      </p>
    </form>
  );
}
