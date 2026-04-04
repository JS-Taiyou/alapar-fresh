import { useSignal } from "@preact/signals";

interface JoinButtonProps {
  code: string;
}

export default function JoinButton(props: JoinButtonProps) {
  const loading = useSignal(false);
  const error = useSignal("");

  async function handleJoin() {
    loading.value = true;
    error.value = "";
    try {
      const res = await fetch("/api/invitations/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: props.code }),
      });
      const data = await res.json();
      if (data.registryId) {
        globalThis.location.href = "/dashboard";
      } else {
        error.value = data.error || "Error al unirse";
        loading.value = false;
      }
    } catch {
      error.value = "Error de conexión";
      loading.value = false;
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleJoin}
        disabled={loading.value}
        class="w-full py-3 bg-primary hover:bg-primary-light text-white font-semibold rounded-custom transition-all shadow-lg active:scale-95 disabled:opacity-50"
      >
        {loading.value ? "Uniéndote..." : "Unirme al Registro"}
      </button>
      {error.value && (
        <p class="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-custom px-4 py-3 mt-4">
          {error.value}
        </p>
      )}
    </div>
  );
}
