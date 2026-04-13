import { useSignal, useSignalEffect } from "@preact/signals";
import type { DefaultSplit, Entity, Registry, User } from "../lib/types.ts";
import EntityManager from "./EntityManager.tsx";
import DefaultSplitConfig from "./DefaultSplitConfig.tsx";

interface SidebarProps {
  registries: Registry[];
  activeRegistryId: string;
  userName: string;
  userInitials: string;
  isOwner: boolean;
  ownerRegistryIds: Set<string>;
  entities: Entity[];
  registryUsers: User[];
  defaultSplit: DefaultSplit | null;
  deletableRegistryIds: Set<string>;
  initialCollapsed?: boolean;
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
  const registries = useSignal(props.registries);
  const collapsed = useSignal(props.initialCollapsed ?? false);
  const mobileOpen = useSignal(false);
  const showInvite = useSignal(false);
  const isStandalone = useSignal(false);
  const inviteLoading = useSignal(false);
  const inviteCode = useSignal("");
  const inviteError = useSignal("");
  const copied = useSignal(false);
  const renamingId = useSignal<string | null>(null);
  const renameValue = useSignal("");
  const showSplitConfig = useSignal<string | null>(null);

  useSignalEffect(() => {
    isStandalone.value = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let twoFingerActive = false;

    const SWIPE_THRESHOLD = 80;
    const MAX_VERTICAL_RATIO = 0.5;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        twoFingerActive = true;
        const avgX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        touchStartX = avgX;
        touchStartY = avgY;
        touchStartTime = Date.now();
      } else if (e.touches.length === 1 && isStandalone.value) {
        twoFingerActive = false;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      const isMobile = window.innerWidth < 768;
      if (!isMobile) return;

      const dt = Date.now() - touchStartTime;
      if (dt > 600) return;

      let endX: number;
      let endY: number;

      if (twoFingerActive) {
        if (e.touches.length > 0) return;
        endX = e.changedTouches[0].clientX;
        endY = e.changedTouches[0].clientY;
        twoFingerActive = false;
      } else if (isStandalone.value && e.changedTouches.length === 1) {
        endX = e.changedTouches[0].clientX;
        endY = e.changedTouches[0].clientY;
      } else {
        return;
      }

      const dx = endX - touchStartX;
      const dy = Math.abs(endY - touchStartY);
      if (dy / (Math.abs(dx) + 1) > MAX_VERTICAL_RATIO) return;

      if (dx > SWIPE_THRESHOLD && !mobileOpen.value) {
        mobileOpen.value = true;
      } else if (dx < -SWIPE_THRESHOLD && mobileOpen.value) {
        mobileOpen.value = false;
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  });

  async function switchRegistry(id: string) {
    if (id === props.activeRegistryId) return;
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

  function startRename(id: string, currentName: string) {
    renamingId.value = id;
    renameValue.value = currentName;
  }

  async function confirmRename(id: string) {
    const name = renameValue.value.trim();
    if (!name) {
      renamingId.value = null;
      return;
    }
    const original = registries.value.find((r) => r.id === id)?.name ?? "";
    if (name === original) {
      renamingId.value = null;
      return;
    }
    const oldRegistries = registries.value;
    registries.value = registries.value.map((r) =>
      r.id === id ? { ...r, name } : r
    );
    renamingId.value = null;
    try {
      await fetch(`/api/registries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } catch {
      registries.value = oldRegistries;
    }
  }

  async function handleDeleteRegistry(id: string) {
    if (!confirm("Eliminar este registro? Esta acción no se puede deshacer.")) {
      return;
    }
    const res = await fetch(`/api/registries/${id}`, { method: "DELETE" });
    if (res.status === 409) {
      alert("No se puede eliminar un registro con transacciones.");
      return;
    }
    globalThis.location.reload();
  }

  const sidebarContent = (
    <>
      <div class={`border-b border-white/10 flex items-center transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "p-1.5 justify-center" : "p-4 justify-between"}`}>
        <div class={`flex items-center gap-3 min-w-0 transition-opacity duration-200 overflow-hidden ${collapsed.value && !mobileOpen.value ? "opacity-0 w-0" : "opacity-100"}`}>
          <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-white shrink-0">
            {props.userInitials}
          </div>
          <div class="flex flex-col min-w-0 whitespace-nowrap">
            <span class="text-sm font-semibold text-white truncate">
              {props.userName}
            </span>
            <span class="text-xs text-gray-500">A la par</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (globalThis.innerWidth < 768) {
              mobileOpen.value = false;
            } else {
              collapsed.value = !collapsed.value;
              document.cookie =
                `sidebar-collapsed=${collapsed.value};path=/;max-age=${
                  60 * 60 * 24 * 365
                };samesite=lax`;
            }
          }}
          class={`hover:bg-white/10 rounded-custom text-gray-400 hover:text-white transition-all duration-300 shrink-0 hidden md:flex items-center justify-center bg-white/5 border border-white/10 ${collapsed.value && !mobileOpen.value ? "p-2.5 w-full" : "p-2.5"}`}
        >
          <svg
            class="w-5 h-5 shrink-0"
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
      <div class={`flex-1 overflow-hidden space-y-2 transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "p-1.5" : "p-4 overflow-y-auto custom-scrollbar"}`}>
        <h3 class={`px-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 whitespace-nowrap transition-opacity duration-200 ${collapsed.value && !mobileOpen.value ? "opacity-0 h-0" : "opacity-100"}`}>
          Registros
        </h3>
        {registries.value.map((r, i) => (
          <div key={r.id} class="group relative">
            {renamingId.value === r.id
              ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    confirmRename(r.id);
                  }}
                  class={`w-full flex items-center rounded-custom ${
                    collapsed.value && !mobileOpen.value ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
                  } ${
                    r.id === props.activeRegistryId
                      ? "bg-white/5 border border-white/10 text-white"
                      : "bg-white/5 border border-white/10 text-white"
                  }`}
                >
                  <div
                    class="w-2 h-2 rounded-full flex-shrink-0"
                    style={`background-color: ${
                      REGISTRY_COLORS[i % REGISTRY_COLORS.length]
                    }`}
                  />
                  <input
                    type="text"
                    value={renameValue.value}
                    onInput={(e) =>
                      renameValue.value = (e.target as HTMLInputElement).value}
                    onBlur={() => confirmRename(r.id)}
                    class={`flex-1 min-w-0 bg-white/5 border border-white/10 rounded text-sm font-medium text-white p-1 px-2 focus:outline-none focus:ring-1 focus:ring-white/20 ${collapsed.value && !mobileOpen.value ? "opacity-0 w-0 p-0" : ""}`}
                    autofocus
                  />
                </form>
              )
              : (
                <button
                  type="button"
                  onClick={() => switchRegistry(r.id)}
                  class={`w-full flex items-center rounded-custom transition-all duration-300 ${
                    collapsed.value && !mobileOpen.value
                      ? "justify-center p-2.5"
                      : "gap-3 px-3 py-2.5"
                  } ${
                    collapsed.value && !mobileOpen.value
                      ? ""
                      : r.id === props.activeRegistryId
                        ? "bg-white/5 border border-white/10 text-white"
                        : "hover:bg-white/5 text-gray-400 hover:text-white"
                  }`}
                  style={collapsed.value && !mobileOpen.value ? `background-color: ${REGISTRY_COLORS[i % REGISTRY_COLORS.length]}20; border: 1px solid ${REGISTRY_COLORS[i % REGISTRY_COLORS.length]}40` : undefined}
                  title={r.name}
                >
                  <div
                    class={`rounded-full flex-shrink-0 transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "w-2 h-2" : "w-2 h-2"}`}
                    style={collapsed.value && !mobileOpen.value ? undefined : `background-color: ${REGISTRY_COLORS[i % REGISTRY_COLORS.length]}`}
                  />
                  <span class={`text-sm font-medium truncate min-w-0 whitespace-nowrap transition-all duration-200 ${collapsed.value && !mobileOpen.value ? "opacity-0 w-0 overflow-hidden" : "opacity-100 flex-1"}`}>
                    {r.name}
                  </span>
                  <span style="opacity:0" class={`sidebar-action-btns items-center gap-1.5 flex-shrink-0 transition-opacity duration-200 ${collapsed.value && !mobileOpen.value ? "w-0 overflow-hidden hidden" : "flex"}`}>
                    {props.ownerRegistryIds.has(r.id) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(r.id, r.name);
                        }}
                        class="p-2 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors"
                        title="Renombrar"
                      >
                        <svg
                          class="w-4.5 h-4.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                          />
                        </svg>
                      </button>
                    )}
                    {props.ownerRegistryIds.has(r.id) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          showSplitConfig.value = r.id;
                        }}
                        class="p-2 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors text-sm font-bold"
                        title="División Default"
                      >
                        %
                      </button>
                    )}
                    {props.ownerRegistryIds.has(r.id) &&
                      props.deletableRegistryIds.has(r.id) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRegistry(r.id);
                        }}
                        class="p-2 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-colors"
                        title="Eliminar"
                      >
                        <svg
                          class="w-4.5 h-4.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                          />
                        </svg>
                      </button>
                    )}
                  </span>
                </button>
              )}
          </div>
        ))}
      </div>

      {props.isOwner && props.activeRegistryId && (
        <div class={`transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "px-1.5 pb-1.5" : "px-4 pb-2"}`}>
          <button
            type="button"
            onClick={() => {
              showInvite.value = true;
            }}
            class={`w-full flex items-center bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-custom text-sm font-semibold text-emerald-400 transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "justify-center p-2.5" : "justify-center gap-2 py-2.5 px-3"}`}
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
            <span class={`whitespace-nowrap transition-opacity duration-200 ${collapsed.value && !mobileOpen.value ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}`}>Invitar</span>
          </button>
        </div>
      )}

      {props.activeRegistryId && (
        <div class={`transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "px-1.5 pb-1.5" : "px-4 pb-2"}`}>
          <div class={`transition-opacity duration-200 ${collapsed.value && !mobileOpen.value ? "opacity-0 h-0 overflow-hidden" : "opacity-100"}`}>
            <EntityManager
              registryId={props.activeRegistryId}
              entities={props.entities}
              onUpdate={() => globalThis.location.reload()}
            />
          </div>
          {collapsed.value && !mobileOpen.value && (
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
                class="w-5 h-5 shrink-0"
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

      <div class={`border-t border-white/10 space-y-2 transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "p-1.5" : "p-4"}`}>
        <a
          href="/registries/new"
          class={`flex items-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-custom text-sm font-semibold text-white transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "justify-center p-2.5" : "justify-center gap-2 py-3 px-4"}`}
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
          <span class={`whitespace-nowrap transition-opacity duration-200 ${collapsed.value && !mobileOpen.value ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}`}>
            Nuevo Registro
          </span>
        </a>
        <button
          type="button"
          onClick={handleLogout}
          class={`w-full flex items-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-custom text-sm font-semibold text-slate-400 hover:text-red-400 transition-all duration-300 ${collapsed.value && !mobileOpen.value ? "justify-center p-2.5" : "justify-center gap-2 py-2.5 px-4"}`}
        >
          <svg
            class="w-4 h-4 shrink-0"
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
          <span class={`whitespace-nowrap transition-opacity duration-200 ${collapsed.value && !mobileOpen.value ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}`}>Cerrar sesión</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => mobileOpen.value = true}
        class={`md:hidden fixed bottom-20 left-4 z-40 w-12 h-12 bg-surface border border-border-custom rounded-full text-white shadow-lg flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all ${isStandalone.value ? "hidden" : ""}`}
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

      {showSplitConfig.value && (
        <DefaultSplitConfig
          registryId={showSplitConfig.value}
          users={props.registryUsers}
          defaultSplit={registries.value.find((r) => r.id === showSplitConfig.value)?.defaultSplit ?? null}
          isOwner={props.ownerRegistryIds.has(showSplitConfig.value)}
          autoOpen
          onClose={() => showSplitConfig.value = null}
        />
      )}
    </>
  );
}
