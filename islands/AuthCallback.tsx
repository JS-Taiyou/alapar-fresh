import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AuthCallbackProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  redirectPath: string;
}

export default function AuthCallback(props: AuthCallbackProps) {
  const error = useSignal("");

  let client: SupabaseClient;
  try {
    client = createClient(props.supabaseUrl, props.supabaseAnonKey);
  } catch {
    error.value = "Error al inicializar el cliente de auth";
  }

  useEffect(() => {
    if (error.value) return;

    const params = new URL(globalThis.location.href).searchParams;
    const code = params.get("code");

    if (!code) {
      globalThis.location.href = "/login?error=auth";
      return;
    }

    client.auth.exchangeCodeForSession(code)
      .then(({ data, error: exchangeError }) => {
        if (exchangeError || !data.session) {
          console.error("OAuth exchange error:", exchangeError);
          globalThis.location.href = "/login?error=auth";
          return;
        }

        return fetch("/api/auth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          }),
        });
      })
      .then((res) => {
        if (res && res.ok) {
          globalThis.location.href = props.redirectPath;
        } else if (res) {
          res.text().then((t) => {
            console.error("Cookie set failed:", t);
            globalThis.location.href = "/login?error=auth";
          });
        }
      })
      .catch((err) => {
        console.error("OAuth callback error:", err);
        globalThis.location.href = "/login?error=auth";
      });
  }, []);

  return (
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-slate-400 text-sm">
        {error.value ? error.value : "Autenticando..."}
      </div>
    </div>
  );
}
