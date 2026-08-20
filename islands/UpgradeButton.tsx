import { useSignal } from "@preact/signals";
import Modal from "../components/Modal.tsx";
import { type Locale, t as translate } from "../lib/i18n.ts";

/**
 * "Upgrade to Pro" CTA. Owner variant opens an interval picker and redirects
 * to the Polar checkout; non-owners see a hint to ask the owner instead.
 */
export default function UpgradeButton(
  { locale, registryId, isOwner }: {
    locale: Locale;
    registryId: string;
    isOwner: boolean;
  },
) {
  const t = (key: string) => translate(locale, key);
  const open = useSignal(false);
  const redirecting = useSignal(false);

  function goToCheckout(interval: "monthly" | "yearly") {
    redirecting.value = true;
    globalThis.location.href =
      `/api/billing/checkout?registry_id=${registryId}&interval=${interval}`;
  }

  if (!isOwner) {
    return (
      <div
        class="w-full text-center text-xs text-zinc-500 px-2 py-1"
        title={t("billing.upgrade_hint_member")}
      >
        {t("billing.upgrade_hint_member")}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => open.value = !open.value}
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
      </button>

      {open.value && (
        <Modal
          onClose={() => open.value = false}
          title={t("billing.upgrade")}
          subtitle={t("billing.upgrade_hint_owner")}
          widthClass="max-w-sm"
        >
          <div class="p-6">
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={redirecting.value}
                onClick={() => goToCheckout("monthly")}
                class="py-3 rounded-custom bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold transition-all active:scale-95 disabled:opacity-50"
              >
                <span class="block text-sm">{t("billing.monthly")}</span>
                <span class="block text-xs text-zinc-400">$1.99</span>
              </button>
              <button
                type="button"
                disabled={redirecting.value}
                onClick={() => goToCheckout("yearly")}
                class="py-3 rounded-custom btn-primary border border-primary-light/40 font-semibold transition-all active:scale-95 disabled:opacity-50"
              >
                <span class="block text-sm">{t("billing.yearly")}</span>
                <span class="block text-xs opacity-80">$15 · -37%</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => open.value = false}
              class="mt-4 w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
