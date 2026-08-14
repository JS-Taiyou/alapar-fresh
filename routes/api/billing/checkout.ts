import { define } from "../../../utils.ts";
import { billingConfigured, getCheckoutUrl } from "../../../lib/billing.ts";

/**
 * GET /api/billing/checkout?registry_id=…&interval=monthly|yearly
 *
 * Owner-only 302 to the Polar Checkout Link. It's a redirect, not a state
 * change, so GET is appropriate (switch to POST if csrf ever complains).
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
