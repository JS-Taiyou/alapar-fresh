import { useSignal } from "@preact/signals";

interface CortarButtonProps {
  balance: number;
  hasTransactions: boolean;
}

export default function CortarButton(props: CortarButtonProps) {
  const loading = useSignal(false);
  const canCut = props.hasTransactions && props.balance === 0;

  async function handleCortar() {
    if (!canCut || loading.value) return;
    loading.value = true;
    try {
      await fetch("/api/exercises", { method: "POST" });
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }

  return (
    <button
      type="button"
      onClick={handleCortar}
      disabled={!canCut || loading.value}
      class={`px-6 py-3 rounded-custom font-semibold text-white shadow-lg transition-opacity ${
        canCut && !loading.value
          ? "bg-primary hover:opacity-90"
          : "bg-slate-700 opacity-50 cursor-not-allowed"
      }`}
    >
      {loading.value ? "Cortando..." : "Cortar"}
    </button>
  );
}
