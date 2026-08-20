import { define } from "../../../utils.ts";
import { billingConfigured, getCheckoutUrl } from "../../../lib/billing.ts";

/**
 * GET /api/billing/checkout?interval=monthly|yearly
 *
 * 302 to the dashboard-configured Polar Checkout Link, for the CURRENT user.
 * A subscription is per-user: one purchase unlocks Pro on every registry the
 * subscriber owns (joining groups stays free, as always).
 *
 * Why GET (not POST): this is a pure redirect — no state changes on our side
 * — which is exactly what GET semantics describe. Browsers can't be sent to
 * a POST target via location.href, and the pricing page navigates with plain
 * links, so GET keeps the flow simple. The worst a forged GET can do is
 * bounce someone to a Polar checkout page; the subscribing identity is the
 * session's user, resolved server-side (never from the query string).
 *
 * 503 when billing env vars are unset: surfacing misconfiguration beats a
 * broken redirect to a URL we can't build.
 */
export const handler = define.handlers({
  GET(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(ctx.req.url);
    const interval = url.searchParams.get("interval") === "yearly"
      ? "yearly"
      : "monthly";

    if (!billingConfigured()) {
      return Response.json(
        { error: "Billing is not configured" },
        { status: 503 },
      );
    }

    const checkoutUrl = getCheckoutUrl(
      userId,
      interval,
      ctx.state.locale,
    );
    return new Response(null, {
      status: 302,
      headers: { Location: checkoutUrl },
    });
  },
});
