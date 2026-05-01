import { useSignal } from "@preact/signals";

interface CortarButtonProps {
  hasTransactions: boolean;
  registryId: string;
}

export default function CortarButton(props: CortarButtonProps) {
  const loading = useSignal(false);
  const showModal = useSignal(false);
  const canCut = props.hasTransactions;

  async function handleCortar() {
    if (!canCut || loading.value) return;
    loading.value = true;
    try {
      await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registryId: props.registryId }),
      });
      globalThis.location.reload();
    } catch {
      globalThis.location.reload();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (canCut) showModal.value = true;
        }}
        disabled={!canCut}
        class={`px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-base rounded-custom font-semibold text-white shadow-lg transition-opacity ${
          canCut
            ? "bg-primary hover:opacity-90"
            : "bg-slate-700 opacity-50 cursor-not-allowed"
        }`}
      >
        Cortar
      </button>

      {showModal.value && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) showModal.value = false;
          }}
        >
          <div class="bg-surface border border-border-custom w-full max-w-md rounded-custom shadow-2xl flex flex-col overflow-hidden">
            <header class="px-6 py-4 border-b border-border-custom">
              <h2 class="text-xl font-bold text-white">Cortar ejercicio</h2>
              <p class="text-sm text-zinc-400 mt-1">
                Esta acción cerrará el periodo actual y no se puede deshacer.
              </p>
            </header>

            <div class="p-6">
              <p class="text-sm text-zinc-300">
                Se crearán transacciones de ajuste para los saldos pendientes
                entre los miembros del registro.
              </p>
            </div>

            <footer class="px-6 py-4 border-t border-border-custom bg-white/5 flex justify-end items-center gap-3">
              <button
                type="button"
                onClick={() => showModal.value = false}
                class="px-6 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCortar}
                disabled={loading.value}
                class="px-8 py-2 text-sm font-semibold bg-primary hover:bg-primary-light text-white rounded-custom transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {loading.value ? "Cortando..." : "Cortar"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
