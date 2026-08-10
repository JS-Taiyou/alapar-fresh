import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import AuthCardLayout from "../components/AuthCardLayout.tsx";

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
    <AuthCardLayout pageTitle="A la par - Autenticando" centered>
      {error.value
        ? (
          <>
            <div class="text-red-300 bg-red-500/20 border border-red-500/30 rounded-custom px-4 py-3 text-sm text-center mb-4">
              {error.value}
            </div>
            <details class="mb-6">
              <summary class="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors">
                Detalles técnicos
              </summary>
              <pre class="text-xs text-zinc-500 bg-background mt-2 p-3 rounded-custom overflow-auto text-left whitespace-pre-wrap break-all">
                {debug.value}
              </pre>
            </details>
            <a
              href="/login"
              class="block w-full py-3 btn-primary rounded-custom text-center transition-all shadow-lg active:scale-95"
            >
              Volver a iniciar sesión
            </a>
          </>
        )
        : (
          <div class="flex flex-col items-center gap-4 py-4">
            <svg
              class="w-10 h-10 text-primary animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p class="text-zinc-300 text-sm font-medium">Autenticando...</p>
          </div>
        )}
    </AuthCardLayout>
  );
}
