import { define } from "../../../utils.ts";
import { createPortalSession } from "../../../lib/billing.ts";

/**
 * POST /api/billing/portal — owner-only; returns a hosted Polar customer
 * portal URL (cancel / update payment method self-service).
 */
export const handler = define.handlers({
  async POST(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await ctx.req.json().catch(() => ({}));
    const registryId = (body as { registry_id?: string }).registry_id ?? "";
    if (!registryId || !ctx.state.ownerRegistryIds.has(registryId)) {
      return Response.json(
        { error: "Only the owner can manage this registry's plan" },
        { status: 403 },
      );
    }

    const url = await createPortalSession();
    if (!url) {
      return Response.json(
        { error: "Could not create portal session" },
        { status: 502 },
      );
    }
    return Response.json({ url });
  },
});
