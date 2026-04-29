import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

interface AuthCallbackProps {
  redirectPath: string;
}

export default function AuthCallback(props: AuthCallbackProps) {
  const error = useSignal("");
  const debug = useSignal("Initializing...");

  useEffect(() => {
    const hash = globalThis.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const hashError = params.get("error_description");

    if (hashError) {
      debug.value = `Auth error: ${hashError}`;
      error.value = hashError;
      return;
    }

    if (!accessToken || !refreshToken) {
      debug.value = `No tokens in hash. URL: ${globalThis.location.href}`;
      error.value = "No se recibieron tokens de autenticación.";
      return;
    }

    debug.value = "Tokens found, setting cookies...";

    fetch("/api/auth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, refreshToken }),
    })
      .then((res) => {
        if (res.ok) {
          globalThis.location.href = props.redirectPath;
        } else {
          res.text().then((t) => {
            debug.value = `Cookie set failed: ${t}`;
            error.value = `Cookie set failed: ${t}`;
          });
        }
      })
      .catch((err) => {
        debug.value = `Fetch error: ${String(err)}`;
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
              <a
                href="/login"
                class="text-primary hover:underline text-sm mt-4 inline-block"
              >
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
