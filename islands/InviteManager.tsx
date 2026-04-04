import { useSignal } from "@preact/signals";

interface Invitation {
  id: string;
  code: string;
  expiresAt: Date | null;
  maxUses: number | null;
  currentUses: number;
  revokedAt: Date | null;
  createdAt: Date;
}

interface InviteManagerProps {
  registryId: string;
}

export default function InviteManager(props: InviteManagerProps) {
  const show = useSignal(false);
  const invitations = useSignal<Invitation[]>([]);
  const loading = useSignal(false);
  const creating = useSignal(false);
  const newCode = useSignal("");
  const error = useSignal("");

  async function loadInvitations() {
    loading.value = true;
    try {
      const res = await fetch(
        `/api/invitations/list?registryId=${props.registryId}`,
      );
      if (res.ok) {
        invitations.value = await res.json();
      }
    } catch {
      error.value = "Error al cargar invitaciones";
    }
    loading.value = false;
  }

  function openModal() {
    show.value = true;
    error.value = "";
    newCode.value = "";
    loadInvitations();
  }

  async function handleCreate() {
    creating.value = true;
    error.value = "";
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registryId: props.registryId }),
      });
      const data = await res.json();
      if (data.code) {
        newCode.value = data.code;
        loadInvitations();
      } else {
        error.value = data.error || "Error al crear invitación";
      }
    } catch {
      error.value = "Error de conexión";
    }
    creating.value = false;
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/invitations/${id}/revoke`, { method: "POST" });
    loadInvitations();
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        class="p-3 bg-card hover:bg-white/5 transition-colors rounded-custom text-gray-300"
        title="Gestionar Invitaciones"
      >
        <svg
          class="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
          />
        </svg>
      </button>

      {show.value && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) show.value = false;
          }}
        >
          <div class="bg-surface border border-border-custom w-full max-w-lg rounded-custom shadow-2xl flex flex-col overflow-hidden">
            <header class="px-6 py-4 border-b border-border-custom">
              <h2 class="text-xl font-bold text-white">Invitaciones</h2>
              <p class="text-sm text-slate-400 mt-1">
                Gestiona las invitaciones de este registro
              </p>
            </header>

            <div class="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating.value}
                class="w-full py-3 bg-primary hover:bg-primary-light text-white font-semibold rounded-custom transition-all active:scale-95 disabled:opacity-50"
              >
                {creating.value ? "Generando..." : "Nueva Invitación"}
              </button>

              {newCode.value && (
                <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-custom p-4 text-center">
                  <p class="text-sm text-emerald-400 mb-2">Código generado:</p>
                  <div class="flex items-center justify-center gap-2">
                    <span class="text-2xl font-mono font-bold text-white tracking-widest">
                      {newCode.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyCode(newCode.value)}
                      class="p-1.5 hover:bg-white/10 rounded text-primary"
                    >
                      <svg
                        class="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {error.value && <p class="text-sm text-red-400">{error.value}</p>}

              {loading.value
                ? <p class="text-center text-slate-400 text-sm">Cargando...</p>
                : invitations.value.length > 0
                ? (
                  <div class="space-y-2">
                    {invitations.value.map((inv) => (
                      <div
                        key={inv.id}
                        class="flex items-center justify-between p-3 bg-background border border-border-custom rounded-custom"
                      >
                        <div>
                          <span class="font-mono text-sm font-semibold text-white">
                            {inv.code}
                          </span>
                          <span class="text-xs text-slate-500 ml-2">
                            {inv.currentUses}
                            {inv.maxUses ? `/${inv.maxUses}` : ""} usos
                          </span>
                          {inv.revokedAt && (
                            <span class="text-xs text-red-400 ml-2">
                              Revocada
                            </span>
                          )}
                        </div>
                        {!inv.revokedAt && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(inv.id)}
                            class="text-xs text-slate-500 hover:text-red-400 transition-colors"
                          >
                            Revocar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
                : (
                  <p class="text-center text-slate-500 text-sm">
                    No hay invitaciones activas
                  </p>
                )}
            </div>

            <footer class="px-6 py-4 border-t border-border-custom bg-slate-800/20 flex justify-end">
              <button
                type="button"
                onClick={() => show.value = false}
                class="px-6 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Cerrar
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
