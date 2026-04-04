import { useSignal } from "@preact/signals";

export default function SearchBar() {
  const query = useSignal("");

  return (
    <div class="mb-6">
      <div class="relative">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
          </svg>
        </span>
        <input
          class="w-full bg-slate-800 border-slate-700 rounded-custom pl-10 text-white focus:ring-primary focus:border-primary py-2.5"
          placeholder="Buscar corte por mes o año..."
          type="text"
          value={query.value}
          onInput={(e) => query.value = (e.target as HTMLInputElement).value}
        />
      </div>
    </div>
  );
}
