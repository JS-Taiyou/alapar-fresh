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
  const debug = useSignal("Initializing...");

  let client: SupabaseClient;
  try {
    client = createClient(props.supabaseUrl, props.supabaseAnonKey);
  } catch (e) {
    error.value = "Error al inicializar el cliente de auth";
    debug.value = String(e);
  }

  useEffect(() => {
    if (error.value) return;

    const href = globalThis.location.href;
    const hash = globalThis.location.hash;
    debug.value = `URL: ${href} | hash: ${hash}`;

    const params = new URL(href).searchParams;
    const code = params.get("code");

    if (!code) {
      debug.value = `No code param. Full URL: ${href}`;
      error.value = "No code param found in URL";
      return;
    }

    debug.value = `Exchanging code: ${code.substring(0, 8)}...`;

    client.auth.exchangeCodeForSession(code)
      .then(({ data, error: exchangeError }) => {
        if (exchangeError || !data.session) {
          debug.value = `Exchange failed: ${exchangeError?.message ?? "no session"}`;
          error.value = exchangeError?.message ?? "Exchange returned no session";
          return;
        }

        debug.value = "Exchange OK, setting cookies...";

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
            debug.value = `Cookie set failed: ${t}`;
            error.value = `Cookie set failed: ${t}`;
          });
        }
      })
      .catch((err) => {
        debug.value = `Callback error: ${String(err)}`;
        error.value = String(err);
      });
  }, []);

  return (
    <div class="min-h-screen flex items-center justify-center p-6">
      <div class="text-center max-w-lg">
        {error.value
          ? (
            <>
              <div class="text-red-400 text-sm mb-4">{error.value}</div>
              <pre class="text-xs text-slate-500 bg-slate-900 p-3 rounded overflow-auto text-left whitespace-pre-wrap break-all">
                {debug.value}
              </pre>
              <a href="/login" class="text-primary hover:underline text-sm mt-4 inline-block">
                Volver a iniciar sesión
              </a>
            </>
          )
          : (
            <div class="text-slate-400 text-sm">
              Autenticando...
              <pre class="text-xs text-slate-600 mt-2">{debug.value}</pre>
            </div>
          )}
      </div>
    </div>
  );
}
