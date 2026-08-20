import { type Locale, t as translate } from "../lib/i18n.ts";

/**
 * "Upgrade to Pro" CTA in the sidebar (free-plan active registry only).
 * Funnels to the public pricing page — the tier comparison, interval
 * switcher and checkout all live there.
 */
export default function UpgradeButton(
  { locale, isOwner }: { locale: Locale; isOwner: boolean },
) {
  const t = (key: string) => translate(locale, key);

  if (!isOwner) {
    return (
      <a
        href="/pricing"
        class="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 transition-colors"
        title={t("billing.upgrade_hint_member")}
      >
        {t("billing.upgrade_hint_member")}
      </a>
    );
  }

  return (
    <a
      href="/pricing"
      class="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-primary-light hover:opacity-90 border border-primary-light/40 rounded-custom text-sm font-semibold text-white transition-all py-2.5 px-4"
      title={t("billing.upgrade_hint_owner")}
    >
      <svg
        class="w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </svg>
      <span class="whitespace-nowrap">{t("billing.upgrade")}</span>
    </a>
  );
}
