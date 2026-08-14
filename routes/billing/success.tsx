import { Head } from "fresh/runtime";
import { define } from "../../utils.ts";
import { syncCheckout } from "../../lib/billing.ts";
import { t } from "../../lib/i18n.ts";

/**
 * GET /billing/success?checkout_id=… — Polar redirects here after checkout.
 * Calls syncCheckout for instant confirmation (webhooks can lag seconds).
 */
export const handler = define.handlers({
  async GET(ctx) {
    const checkoutId = new URL(ctx.req.url).searchParams.get("checkout_id");
    let activated = false;
    if (checkoutId) {
      try {
        const result = await syncCheckout(checkoutId);
        activated = !!result &&
          (result.status === "active" || result.status === "trialing");
      } catch (err) {
        console.error("[billing] syncCheckout failed:", err);
      }
    }
    return ctx.render({ activated });
  },
});

export default define.page(function BillingSuccess(ctx) {
  const { activated } = ctx.data as { activated: boolean };
  const locale = ctx.state.locale;

  return (
    <main class="min-h-screen flex items-center justify-center p-6 bg-pattern">
      <div class="absolute inset-0 gradient-glow pointer-events-none" />
      <div class="bg-surface border border-border-custom rounded-custom p-8 w-full max-w-md z-10 text-center">
        <div
          class={`w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center ${
            activated
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-primary/20 text-primary"
          }`}
        >
          <svg
            class="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d={activated
                ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                : "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"}
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white mb-2">
          {activated
            ? t(locale, "billing.success_title")
            : t(locale, "billing.success_pending_title")}
        </h1>
        <p class="text-zinc-400 text-sm mb-6">
          {activated
            ? t(locale, "billing.success_desc")
            : t(locale, "billing.success_pending_desc")}
        </p>
        <a
          href="/dashboard"
          class="block w-full py-3 btn-primary rounded-custom text-center transition-all shadow-lg active:scale-95"
        >
          {t(locale, "billing.back_to_dashboard")}
        </a>
      </div>
      <Head>
        <title>{t(locale, "billing.success_title")}</title>
      </Head>
    </main>
  );
});
