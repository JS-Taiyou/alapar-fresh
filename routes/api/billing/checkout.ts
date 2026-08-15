import { define } from "../../../utils.ts";
import { billingConfigured, getCheckoutUrl } from "../../../lib/billing.ts";

/**
 * GET /api/billing/checkout?registry_id=…&interval=monthly|yearly
 *
 * Owner-only 302 to the dashboard-configured Polar Checkout Link.
 *
 * Why GET (not POST): this is a pure redirect — no state changes on our side
 * — which is exactly what GET semantics describe. Browsers can't be sent to
 * a POST target via location.href, and the UpgradeButton navigates with
 * location.href, so GET keeps the flow simple. The worst a forged GET can do
 * is bounce someone to a Polar checkout page for a registry they already
 * own; ownership is checked below before we even build the URL.
 *
 * Authz: `ctx.state.ownerRegistryIds` is populated by the middleware from
 * registry_members WHERE role='owner' — membership is resolved server-side,
 * the client cannot claim ownership via the query string.
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
    const registryId = url.searchParams.get("registry_id") ?? "";
    const interval = url.searchParams.get("interval") === "yearly"
      ? "yearly"
      : "monthly";

    // Owner check against state resolved by middleware (registries the user
    // belongs to + ownerRegistryIds set).
    if (!ctx.state.ownerRegistryIds.has(registryId)) {
      return Response.json(
        { error: "Only the owner can manage this registry's plan" },
        { status: 403 },
      );
    }

    if (!billingConfigured()) {
      return Response.json(
        { error: "Billing is not configured" },
        { status: 503 },
      );
    }

    const checkoutUrl = getCheckoutUrl(
      registryId,
      interval,
      ctx.state.locale,
    );
    return new Response(null, {
      status: 302,
      headers: { Location: checkoutUrl },
    });
  },
});
