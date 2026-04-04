import { useSignal } from "@preact/signals";
import type { DefaultSplit, Registry, User } from "../lib/types.ts";
import EntityManager from "./EntityManager.tsx";
import DefaultSplitConfig from "./DefaultSplitConfig.tsx";

interface SidebarProps {
  registries: Registry[];
  activeRegistryId: string;
  userName: string;
  userInitials: string;
  isOwner: boolean;
  entities: User[];
  registryUsers: User[];
  defaultSplit: DefaultSplit | null;
}

const REGISTRY_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
];

export default function Sidebar(props: SidebarProps) {
  const collapsed = useSignal(false);
  const mobileOpen = useSignal(false);
  const showInvite = useSignal(false);
  const inviteLoading = useSignal(false);
  const inviteCode = useSignal("");
  const inviteError = useSignal("");
  const copied = useSignal(false);

  async function switchRegistry(id: string) {
    try {
      const res = await fetch("/api/registries/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registryId: id }),
      });
      if (res.ok) {
        globalThis.location.href = "/dashboard";
      }
    } catch {
      globalThis.location.reload();
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    globalThis.location.href = "/login";
  }

  async function handleCreateInvite() {
    inviteLoading.value = true;
    inviteError.value = "";
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registryId: props.activeRegistryId }),
      });
      const data = await res.json();
      if (data.code) {
        inviteCode.value = data.code;
      } else {
        inviteError.value = data.error || "Error al crear invitación";
      }
    } catch {
      inviteError.value = "Error de conexión";
    }
    inviteLoading.value = false;
  }

  function copyCode() {
    navigator.clipboard.writeText(inviteCode.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }

  function closeInviteModal() {
    showInvite.value = false;
    inviteCode.value = "";
    inviteError.value = "";
    copied.value = false;
  }

  const sidebarContent = (
    <>
      <div class="p-4 border-b border-white/10 flex items-center justify-between">
        {(!collapsed.value || mobileOpen.value) && (
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-white shrink-0">
              {props.userInitials}
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-semibold text-white truncate">
                {props.userName}
              </span>
              <span class="text-xs text-gray-500">A la par</span>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (globalThis.innerWidth < 768) {
              mobileOpen.value = false;
            } else {
              collapsed.value = !collapsed.value;
            }
          }}
          class="p-2 hover:bg-white/5 rounded-custom text-gray-400 hover:text-white transition-colors shrink-0 hidden md:flex"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {collapsed.value
              ? (
                <path
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              )
              : (
                <path
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              )}
          </svg>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
        {(!collapsed.value || mobileOpen.value) && (
          <h3 class="px-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
            Registros
          </h3>
        )}
        {props.registries.map((r, i) => (
          <button
            type="button"
            key={r.id}
            onClick={() => switchRegistry(r.id)}
            class={`w-full flex items-center gap-3 px-3 py-2.5 rounded-custom transition-colors ${
              r.id === props.activeRegistryId
                ? "bg-white/5 border border-white/10 text-white"
                : "hover:bg-white/5 text-gray-400 hover:text-white"
            }`}
            title={r.name}
          >
            <div
              class="w-2 h-2 rounded-full flex-shrink-0"
              style={`background-color: ${
                REGISTRY_COLORS[i % REGISTRY_COLORS.length]
              }`}
            />
            {(!collapsed.value || mobileOpen.value) && (
              <span class="text-sm font-medium truncate">{r.name}</span>
            )}
          </button>
        ))}
      </div>

      {props.isOwner && props.activeRegistryId && (
        <div
          class={collapsed.value && !mobileOpen.value
            ? "px-2 pb-2"
            : "px-4 pb-2"}
        >
          <button
            type="button"
            onClick={() => {
              showInvite.value = true;
            }}
            class={`w-full flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-custom text-sm font-semibold text-emerald-400 ${
              collapsed.value && !mobileOpen.value
                ? "justify-center p-2.5"
                : "justify-center py-2.5 px-3"
            }`}
          >
            <svg
              class="w-5 h-5 shrink-0"
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
            {(!collapsed.value || mobileOpen.value) && <span>Invitar</span>}
          </button>
        </div>
      )}

      {props.activeRegistryId && (
        <div
          class={collapsed.value && !mobileOpen.value
            ? "px-2 pb-2"
            : "px-4 pb-2"}
        >
          {(!collapsed.value || mobileOpen.value)
            ? (
              <EntityManager
                registryId={props.activeRegistryId}
                entities={props.entities}
                onUpdate={() => globalThis.location.reload()}
              />
            )
            : (
              <button
                type="button"
                onClick={() => {
                  if (globalThis.innerWidth < 768) {
                    mobileOpen.value = true;
                  } else {
                    collapsed.value = false;
                  }
                }}
                class="w-full flex items-center justify-center p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-custom text-white"
                title="Terceros"
              >
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
              </button>
            )}
        </div>
      )}

      {props.activeRegistryId && (!collapsed.value || mobileOpen.value) && (
        <div class="px-4 pb-2">
          <DefaultSplitConfig
            registryId={props.activeRegistryId}
            users={props.registryUsers}
            defaultSplit={props.defaultSplit}
            isOwner={props.isOwner}
          />
        </div>
      )}

      <div
        class={`border-t border-white/10 space-y-2 ${
          collapsed.value && !mobileOpen.value ? "p-2" : "p-4"
        }`}
      >
        <a
          href="/registries/new"
          class={`flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-custom text-sm font-semibold text-white ${
            collapsed.value && !mobileOpen.value
              ? "justify-center p-2.5"
              : "justify-center py-3 px-4"
          }`}
        >
          <svg
            class="w-5 h-5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 4v16m8-8H4"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          {(!collapsed.value || mobileOpen.value) && (
            <span>
              Nuevo Registro
            </span>
          )}
        </a>
        <button
          type="button"
          onClick={handleLogout}
          class={`w-full flex items-center gap-2 text-slate-500 hover:text-red-400 transition-colors text-sm ${
            collapsed.value && !mobileOpen.value
              ? "justify-center p-2"
              : "justify-center py-2 px-4"
          }`}
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          {(!collapsed.value || mobileOpen.value) && <span>Cerrar sesión</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => mobileOpen.value = true}
        class="md:hidden fixed bottom-20 left-4 z-40 w-12 h-12 bg-surface border border-border-custom rounded-full text-white shadow-lg flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
          />
        </svg>
      </button>

      {mobileOpen.value && (
        <div
          class="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => mobileOpen.value = false}
        />
      )}

      <aside
        class={`hidden md:flex ${
          collapsed.value ? "w-16" : "w-72"
        } bg-[#0a0a0a] border-r border-white/10 flex-col h-full overflow-hidden transition-[width] duration-300`}
      >
        {sidebarContent}
      </aside>

      <aside
        class={`md:hidden fixed top-0 left-0 z-50 w-72 bg-[#0a0a0a] border-r border-white/10 flex flex-col h-full transition-transform duration-300 ${
          mobileOpen.value ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div class="flex items-center justify-between p-4 border-b border-white/10">
          <span class="text-lg font-bold text-white">Menu</span>
          <button
            type="button"
            onClick={() => mobileOpen.value = false}
            class="p-2 hover:bg-white/5 rounded-custom text-gray-400"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M6 18L18 6M6 6l12 12"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </button>
        </div>
        {sidebarContent}
      </aside>

      {showInvite.value && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeInviteModal();
          }}
        >
          <div class="bg-surface border border-border-custom w-full max-w-md rounded-custom shadow-2xl flex flex-col overflow-hidden">
            <header class="px-6 py-4 border-b border-border-custom">
              <h2 class="text-xl font-bold text-white">Invitar al Registro</h2>
              <p class="text-sm text-slate-400 mt-1">
                Genera un código para invitar a alguien
              </p>
            </header>
            <div class="p-6 space-y-4">
              {!inviteCode.value
                ? (
                  <button
                    type="button"
                    onClick={handleCreateInvite}
                    disabled={inviteLoading.value}
                    class="w-full py-3 bg-primary hover:bg-primary-light text-white font-semibold rounded-custom transition-all active:scale-95 disabled:opacity-50"
                  >
                    {inviteLoading.value
                      ? "Generando..."
                      : "Generar Código de Invitación"}
                  </button>
                )
                : (
                  <div class="space-y-3">
                    <div class="text-center">
                      <p class="text-sm text-slate-400 mb-2">
                        Código de invitación:
                      </p>
                      <div class="flex items-center justify-center gap-2">
                        <span class="text-3xl font-mono font-bold text-white tracking-widest">
                          {inviteCode.value}
                        </span>
                        <button
                          type="button"
                          onClick={copyCode}
                          class="p-2 hover:bg-white/10 rounded-custom text-primary transition-colors"
                          title="Copiar"
                        >
                          <svg
                            class="w-5 h-5"
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
                      {copied.value && (
                        <p class="text-xs text-emerald-400 mt-1">Copiado!</p>
                      )}
                    </div>
                    <p class="text-xs text-slate-500 text-center">
                      Comparte este código o el enlace:{" "}
                      {globalThis.location.origin}/join/{inviteCode.value}
                    </p>
                  </div>
                )}
              {inviteError.value && (
                <p class="text-sm text-red-400">{inviteError.value}</p>
              )}
            </div>
            <footer class="px-6 py-4 border-t border-border-custom bg-slate-800/20 flex justify-end">
              <button
                type="button"
                onClick={closeInviteModal}
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
