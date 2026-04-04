import { useSignal } from "@preact/signals";
import type { Registry } from "../lib/types.ts";

interface SidebarProps {
  registries: Registry[];
  activeRegistryId: string;
  userName: string;
  userInitials: string;
}

const REGISTRY_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#14b8a6"];

export default function Sidebar(props: SidebarProps) {
  const collapsed = useSignal(false);

  return (
    <aside class={`${collapsed.value ? "w-16" : "w-72"} bg-[#0a0a0a] border-r border-white/10 flex flex-col h-full transition-all duration-300`}>
      <div class="p-4 border-b border-white/10 flex items-center justify-between">
        {!collapsed.value && (
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-white">
              {props.userInitials}
            </div>
            <div class="flex flex-col">
              <span class="text-sm font-semibold text-white">{props.userName}</span>
              <span class="text-xs text-gray-500">A la par</span>
            </div>
          </div>
        )}
        <button
          onClick={() => collapsed.value = !collapsed.value}
          class="p-2 hover:bg-white/5 rounded-custom text-gray-400 hover:text-white transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {collapsed.value
              ? <path d="M13 5l7 7-7 7M5 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
              : <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />}
          </svg>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
        {!collapsed.value && (
          <h3 class="px-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Registros</h3>
        )}
        {props.registries.map((r, i) => (
          <button
            key={r.id}
            onClick={() => { window.location.href = "/dashboard"; }}
            class={`w-full flex items-center gap-3 px-3 py-2.5 rounded-custom transition-colors ${
              r.id === props.activeRegistryId
                ? "bg-white/5 border border-white/10 text-white"
                : "hover:bg-white/5 text-gray-400 hover:text-white"
            }`}
            title={r.name}
          >
            <div class="w-2 h-2 rounded-full flex-shrink-0" style={`background-color: ${REGISTRY_COLORS[i % REGISTRY_COLORS.length]}`} />
            {!collapsed.value && <span class="text-sm font-medium truncate">{r.name}</span>}
          </button>
        ))}
      </div>
      <div class="p-4 border-t border-white/10">
        <a
          href="/registries/new"
          class={`flex items-center gap-2 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-custom text-sm font-semibold text-white transition-all ${collapsed.value ? "justify-center" : "justify-center"}`}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
          </svg>
          {!collapsed.value && <span>Nuevo Registro</span>}
        </a>
      </div>
    </aside>
  );
}
