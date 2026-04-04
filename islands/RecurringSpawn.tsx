import { useSignal } from "@preact/signals";

interface SpawnCandidate {
  id: string;
  description: string;
  type: "parcialidad" | "recurrente";
  originalAmount: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

interface RecurringSpawnProps {
  candidates: SpawnCandidate[];
}

export default function RecurringSpawn(props: RecurringSpawnProps) {
  const showModal = useSignal(false);
  const loading = useSignal(false);
  const checkedIds = useSignal<Set<string>>(new Set(props.candidates.map((c) => c.id)));
  const quantities = useSignal<Record<string, number>>(
    Object.fromEntries(
      props.candidates.filter((c) => c.type === "parcialidad").map((c) => [c.id, 1]),
    ),
  );
  const disabledIds = useSignal<Set<string>>(new Set());

  if (props.candidates.length === 0) return null;

  function toggleItem(id: string) {
    const next = new Set(checkedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    checkedIds.value = next;
  }

  async function handleDisableRecurring(id: string) {
    await fetch("/api/transactions/disable-recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const next = new Set(disabledIds.value);
    next.add(id);
    disabledIds.value = next;
  }

  function adjustQuantity(id: string, delta: number) {
    const c = props.candidates.find((x) => x.id === id);
    if (!c || c.type !== "parcialidad") return;
    const cur = quantities.value[id] ?? 1;
    const max = c.installmentTotal !== null && c.installmentCurrent !== null
      ? c.installmentTotal - c.installmentCurrent
      : 1;
    const next = Math.max(1, Math.min(cur + delta, max));
    quantities.value = { ...quantities.value, [id]: next };
  }

  async function handleSpawn() {
    loading.value = true;
    const items = [...checkedIds.value]
      .filter((id) => !disabledIds.value.has(id))
      .map((id) => ({
        id,
        quantity: quantities.value[id] ?? 1,
      }));
    if (items.length > 0) {
      await fetch("/api/exercises/carry-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    }
    window.location.reload();
  }

  const visibleCandidates = props.candidates.filter((c) => !disabledIds.value.has(c.id));
  const hasVisible = visibleCandidates.length > 0 || props.candidates.length !== visibleCandidates.length;

  return (
    <>
      <button
        type="button"
        onClick={() => { checkedIds.value = new Set(props.candidates.map((c) => c.id)); showModal.value = true; }}
        class="p-3 bg-card hover:bg-white/5 transition-colors rounded-custom text-gray-300 relative"
        title="Recurrentes"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
        </svg>
        {props.candidates.length > 0 && (
          <span class="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full text-[10px] font-bold text-white flex items-center justify-center">
            {props.candidates.length}
          </span>
        )}
      </button>

      {showModal.value && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) showModal.value = false; }}
        >
          <div class="bg-surface border border-border-custom w-full max-w-lg rounded-custom shadow-2xl flex flex-col overflow-hidden">
            <header class="px-6 py-4 border-b border-border-custom">
              <h2 class="text-xl font-bold text-white">Gastos Recurrentes</h2>
              <p class="text-sm text-slate-400 mt-1">
                Selecciona cuáles incluir en este periodo.
              </p>
            </header>

            <div class="p-6 space-y-3 overflow-y-auto max-h-[60vh]">
              {props.candidates.map((item) => {
                const isDisabled = disabledIds.value.has(item.id);
                if (isDisabled) {
                  return (
                    <div
                      key={item.id}
                      class="flex items-center gap-4 p-4 bg-background border border-border-custom rounded-custom opacity-40"
                    >
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-semibold text-slate-500 line-through truncate">{item.description}</span>
                          <span class="text-xs font-medium px-2 py-0.5 rounded bg-red-500/20 text-red-400">Desactivado</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                const maxQty = item.type === "parcialidad" && item.installmentTotal !== null && item.installmentCurrent !== null
                  ? item.installmentTotal - item.installmentCurrent
                  : 1;

                return (
                  <div
                    key={item.id}
                    class="flex items-center gap-4 p-4 bg-background border border-border-custom rounded-custom hover:bg-white/[0.02] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.value.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      class="w-5 h-5 accent-primary rounded shrink-0"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold text-white truncate">{item.description}</span>
                        <span
                          class={`text-xs font-medium px-2 py-0.5 rounded ${
                            item.type === "parcialidad"
                              ? "bg-primary/20 text-primary"
                              : "bg-emerald-500/20 text-emerald-400"
                          }`}
                        >
                          {item.type === "parcialidad" ? "Parcialidad" : "Recurrente"}
                        </span>
                      </div>
                      <div class="flex items-center gap-2 mt-1 text-xs text-slate-400">
                        <span>
                          ${item.originalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {item.type === "parcialidad" && item.installmentCurrent !== null && item.installmentTotal !== null && (
                          <>
                            <span>&bull;</span>
                            <span class="text-primary">{item.installmentCurrent}/{item.installmentTotal}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {item.type === "parcialidad" && maxQty > 1 && checkedIds.value.has(item.id) && (
                      <div class="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => adjustQuantity(item.id, -1)}
                          class="w-7 h-7 flex items-center justify-center rounded-custom bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-sm font-bold"
                        >
                          -
                        </button>
                        <span class="w-6 text-center text-sm font-semibold text-white">{quantities.value[item.id] ?? 1}</span>
                        <button
                          type="button"
                          onClick={() => adjustQuantity(item.id, 1)}
                          class="w-7 h-7 flex items-center justify-center rounded-custom bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    )}
                    {!checkedIds.value.has(item.id) && (
                      <button
                        type="button"
                        onClick={() => handleDisableRecurring(item.id)}
                        title="Desactivar recurrente"
                        class="shrink-0 p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-custom hover:bg-red-400/10"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M18.364 18.364A9 9 0 015.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <footer class="px-6 py-4 border-t border-border-custom bg-slate-800/20 flex justify-end items-center gap-3">
              <button
                type="button"
                onClick={() => showModal.value = false}
                class="px-6 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSpawn}
                disabled={loading.value}
                class="px-8 py-2 text-sm font-semibold bg-primary hover:bg-primary-light text-white rounded-custom transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {loading.value ? "Creando..." : "Incluir"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
