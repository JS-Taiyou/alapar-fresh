import type { Locale } from "../lib/i18n.ts";

/**
 * A compact ES/EN language toggle. Sends a POST to /api/locale to set the
 * cookie, then reloads the page so SSR re-renders in the new language.
 */
export default function LocaleToggle(
  { locale, class: className }: { locale: Locale; class?: string },
) {
  function switchLocale(newLocale: Locale) {
    if (newLocale === locale) return;
    fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: newLocale }),
    }).then(() => globalThis.location.reload()).catch(() =>
      globalThis.location.reload()
    );
  }

  return (
    <div class={`flex items-center gap-1 text-xs ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => switchLocale("es")}
        class={`px-2 py-1 rounded-custom transition-colors ${
          locale === "es"
            ? "bg-primary text-white font-semibold"
            : "text-zinc-400 hover:text-white hover:bg-white/5"
        }`}
      >
        ES
      </button>
      <button
        type="button"
        onClick={() => switchLocale("en")}
        class={`px-2 py-1 rounded-custom transition-colors ${
          locale === "en"
            ? "bg-primary text-white font-semibold"
            : "text-zinc-400 hover:text-white hover:bg-white/5"
        }`}
      >
        EN
      </button>
    </div>
  );
}
