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

  async function exchangeCode() {
    const params = new URL(globalThis.location.href).searchParams;
    const code = params.get("code");

    if (!code) {
      globalThis.location.href = "/login?error=auth";
      return;
    }

    try {
      const { data, error: exchangeError } = await client.auth
        .exchangeCodeForSession(code);

      if (exchangeError || !data.session) {
        console.error("OAuth exchange error:", exchangeError);
        globalThis.location.href = "/login?error=auth";
        return;
      }

      const res = await fetch("/api/auth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        }),
      });

      if (res.ok) {
        globalThis.location.href = props.redirectPath;
      } else {
        console.error("Cookie set failed:", await res.text());
        globalThis.location.href = "/login?error=auth";
      }
    } catch (err) {
      console.error("OAuth callback error:", err);
      globalThis.location.href = "/login?error=auth";
    }
  }

  if (!error.value) {
    exchangeCode();
  }

  return (
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-slate-400 text-sm">
        {error.value ? error.value : "Autenticando..."}
      </div>
    </div>
  );
}
