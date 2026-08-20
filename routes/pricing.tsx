import { define } from "../utils.ts";
import { query } from "../lib/db.ts";
import { FREE_LIMITS, resolveEffectivePlan } from "../lib/entitlements.ts";
import { FALLBACK_PRICES, getPolarPrices } from "../lib/billing.ts";
import { Head } from "fresh/runtime";
import LocaleToggle from "../islands/LocaleToggle.tsx";
import BillingActions from "../islands/BillingActions.tsx";
import { formatDate, type Locale, t as translate } from "../lib/i18n.ts";

/**
 * Public pricing page. All paywall CTAs in the app funnel here.
 *
 * Session-aware (public path + auth cookies → ctx.state.user via the
 * middleware's lightweight branch; registry data is queried here because
 * the lightweight branch doesn't populate it):
 *
 *   anonymous        → "Suscribirse" to signup (+login link), both
 *                      round-tripping back via ?redirect=/pricing — a
 *                      subscription requires an account that owns a registry.
 *   owns free groups → upgrade CTA straight into the Polar checkout. ONE
 *                      subscription (per-user) unlocks every registry the
 *                      subscriber owns.
 *   live subscription → "Activo" badge + discrete cancel/reactivate/manage
 *                      actions (island) for the rest of the billing cycle.
 *   no owned groups  → create-first CTA (or ask-the-owner hint for members).
 *
 * Prices come from Polar (cached; the dashboard is the source of truth so a
 * price change never needs a deploy) with static fallbacks when unreachable.
 */

interface UserSubState {
  currentPeriodEnd: string | null;
  cancelScheduled: boolean;
}

interface PricingData {
  interval: "monthly" | "yearly";
  /** The user's live subscription (per-user: unlocks every owned registry). */
  userSub: UserSubState | null;
  /** Registries the user owns that are NOT yet Pro (upgrade candidates). */
  ownedFreeCount: number;
  hasGrandfatheredOwned: boolean;
  hasMemberOnly: boolean;
  hasNoRegistries: boolean;
  prices: { monthly: number; yearly: number };
}

export const handler = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.req.url);
    const interval = url.searchParams.get("interval") === "yearly"
      ? "yearly"
      : "monthly";

    const polar = await getPolarPrices();
    const prices = {
      monthly: polar.monthly ?? FALLBACK_PRICES.monthly,
      yearly: polar.yearly ?? FALLBACK_PRICES.yearly,
    };

    const data: PricingData = {
      interval,
      userSub: null,
      ownedFreeCount: 0,
      hasGrandfatheredOwned: false,
      hasMemberOnly: false,
      hasNoRegistries: false,
      prices,
    };

    const userId = ctx.state.user?.id;
    if (userId) {
      const [memberships, sub] = await Promise.all([
        query(
          `SELECT rm.role, r.plan
           FROM registry_members rm
           JOIN registries r ON r.id = rm.registry_id
           WHERE rm.user_id = $1`,
          [userId],
        ),
        query(
          `SELECT status, grace_until, current_period_end, cancel_at_period_end
           FROM registry_subscriptions WHERE user_id = $1`,
          [userId],
        ),
      ]);

      data.hasNoRegistries = memberships.rows.length === 0;

      // The user's subscription is "live" when the same matrix that gates
      // registries says so — one check, shared semantics.
      let subLive = false;
      const subRow = sub.rows[0] as
        | {
          status: string;
          grace_until: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
        }
        | undefined;
      if (subRow) {
        subLive = resolveEffectivePlan(
          "free",
          subRow.status,
          subRow.grace_until ? new Date(subRow.grace_until) : null,
          subRow.current_period_end
            ? new Date(subRow.current_period_end)
            : null,
        ) !== "free";
        if (subLive) {
          data.userSub = {
            currentPeriodEnd: subRow.current_period_end,
            cancelScheduled: subRow.cancel_at_period_end === true,
          };
        }
      }

      for (const row of memberships.rows) {
        if (row.role !== "owner") {
          data.hasMemberOnly = true;
          continue;
        }
        if (row.plan === "grandfathered") {
          data.hasGrandfatheredOwned = true;
          continue;
        }
        // A live subscription unlocks every owned registry; grandfathered
        // ones are Pro on their own. Everything else is an upgrade candidate.
        if (!subLive && row.plan === "free") {
          data.ownedFreeCount++;
        }
      }
    }

    return { data };
  },
});

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul class="space-y-2.5 text-left">
      {items.map((item) => (
        <li key={item} class="flex items-start gap-2.5 text-sm text-zinc-300">
          <svg
            class="w-4 h-4 mt-0.5 shrink-0 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M5 13l4 4L19 7"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default define.page(function PricingPage(ctx) {
  const data = ctx.data as PricingData;
  const locale: Locale = ctx.state.locale;
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params);

  const isAuthed = ctx.state.user !== null;
  const { interval } = data;
  const price = interval === "yearly"
    ? data.prices.yearly
    : data.prices.monthly;
  const periodLabel = t(
    interval === "yearly" ? "pricing.per_year" : "pricing.per_month",
  );
  const yearlyDiscount = data.prices.monthly > 0 && data.prices.yearly > 0
    ? Math.round((1 - data.prices.yearly / (data.prices.monthly * 12)) * 100)
    : 0;

  const freeFeatures = [
    t("pricing.free_registries", { n: FREE_LIMITS.maxOwnedRegistries }),
    t("pricing.free_members", { n: FREE_LIMITS.maxMembers }),
    t("pricing.free_templates", { n: FREE_LIMITS.maxActiveTemplates }),
    t("pricing.free_history"),
    t("pricing.unlimited_core"),
  ];
  const proFeatures = [
    t("pricing.pro_registries"),
    t("pricing.pro_members"),
    t("pricing.pro_templates"),
    t("pricing.pro_history"),
  ];

  const intervalHref = (next: "monthly" | "yearly") =>
    `/pricing?interval=${next}`;
  const activeUntilText = data.userSub?.currentPeriodEnd
    ? formatDate(new Date(data.userSub.currentPeriodEnd), locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : null;

  return (
    <>
      <Head>
        <title>{t("pricing.title")} - A la par</title>
      </Head>
      <main class="relative min-h-screen flex flex-col items-center p-6 bg-pattern">
        <div class="absolute top-4 right-4 z-20">
          <LocaleToggle locale={locale} />
        </div>
        <div class="absolute inset-0 gradient-glow pointer-events-none" />

        <div class="relative z-10 w-full max-w-4xl mt-12 sm:mt-16">
          <header class="text-center mb-8">
            <h1 class="text-3xl sm:text-4xl font-bold text-white">
              {t("pricing.title")}
            </h1>
            <p class="text-zinc-400 mt-2">{t("pricing.subtitle")}</p>
          </header>

          {/* Interval switcher — SSR links, works without JS */}
          <div class="flex justify-center mb-8">
            <div class="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-custom">
              <a
                href={intervalHref("monthly")}
                class={`px-5 py-2 text-sm font-semibold rounded-custom transition-colors ${
                  interval === "monthly"
                    ? "bg-primary text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t("billing.monthly")}
              </a>
              <a
                href={intervalHref("yearly")}
                class={`px-5 py-2 text-sm font-semibold rounded-custom transition-colors ${
                  interval === "yearly"
                    ? "bg-primary text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t("billing.yearly")}
                {yearlyDiscount >= 5 && (
                  <span class="ml-1.5 text-[10px] font-bold text-emerald-400">
                    −{yearlyDiscount}%
                  </span>
                )}
              </a>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* Free tier */}
            <div class="bg-surface border border-border-custom rounded-custom p-6 sm:p-8 flex flex-col">
              <h2 class="text-lg font-bold text-white">
                {t("pricing.free_name")}
              </h2>
              <p class="mt-3 mb-6">
                <span class="text-4xl font-bold text-white">$0</span>
              </p>
              <FeatureList items={freeFeatures} />
            </div>

            {/* Pro tier */}
            <div class="relative bg-surface border border-primary-light/40 rounded-custom p-6 sm:p-8 flex flex-col shadow-lg shadow-primary/10">
              <div class="absolute -top-3 left-6">
                <span class="text-[10px] font-bold tracking-widest bg-primary/20 text-primary-light px-2 py-0.5 rounded-full">
                  {t("billing.pro_badge")}
                </span>
              </div>
              <h2 class="text-lg font-bold text-white">
                {t("pricing.pro_name")}
              </h2>
              <p class="mt-3 mb-2">
                <span class="text-4xl font-bold text-white">
                  ${price.toFixed(2)}
                </span>
                <span class="text-zinc-400">{periodLabel}</span>
              </p>
              <p class="text-xs text-zinc-500 mb-6">
                {t("pricing.pro_includes")}
              </p>
              <FeatureList items={proFeatures} />

              <div class="mt-8 flex flex-col gap-3">
                {!isAuthed && (
                  <>
                    <a
                      href="/signup?redirect=/pricing"
                      class="w-full py-3 text-center text-sm font-semibold bg-primary hover:bg-primary-light text-white rounded-custom transition-all shadow-lg active:scale-95"
                    >
                      {t("pricing.subscribe")}
                    </a>
                    <a
                      href="/login?redirect=/pricing"
                      class="text-center text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      {t("pricing.have_account")}
                    </a>
                  </>
                )}

                {isAuthed && data.userSub && (
                  <div class="text-center space-y-2">
                    <p class="text-sm font-semibold text-emerald-400">
                      {t("pricing.active_badge")} ✓
                      {activeUntilText && !data.userSub.cancelScheduled &&
                        ` · ${
                          t("pricing.active_until", { date: activeUntilText })
                        }`}
                    </p>
                    <BillingActions
                      locale={locale}
                      activeUntil={data.userSub.currentPeriodEnd}
                      cancelScheduled={data.userSub.cancelScheduled}
                    />
                  </div>
                )}

                {isAuthed && !data.userSub && data.ownedFreeCount > 0 && (
                  <a
                    href={`/api/billing/checkout?interval=${interval}`}
                    class="w-full py-3 text-center text-sm font-semibold bg-primary hover:bg-primary-light text-white rounded-custom transition-all shadow-lg active:scale-95"
                  >
                    {t("billing.upgrade")}
                  </a>
                )}

                {isAuthed && data.hasGrandfatheredOwned && (
                  <p class="text-center text-xs text-emerald-400/80 font-semibold">
                    {t("pricing.grandfathered_note")}
                  </p>
                )}

                {isAuthed && !data.userSub && data.ownedFreeCount === 0 &&
                  data.hasMemberOnly && (
                  <p class="text-center text-xs text-zinc-400 px-2">
                    {t("billing.upgrade_hint_member")}
                  </p>
                )}

                {isAuthed && data.hasNoRegistries && (
                  <div class="text-center space-y-2">
                    <p class="text-xs text-zinc-400 px-2">
                      {t("pricing.create_first_hint")}
                    </p>
                    <a
                      href="/registries/new"
                      class="inline-block w-full py-3 text-sm font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-custom transition-all"
                    >
                      {t("pricing.create_first")}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
});
