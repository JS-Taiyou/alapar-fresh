import { define } from "../../../utils.ts";
import { createPortalSession } from "../../../lib/billing.ts";

/**
 * POST /api/billing/portal — owner-only; returns a hosted Polar customer
 * portal URL (cancel / update payment method self-service).
 *
 * Body: `{ registry_id }`. Ownership is resolved server-side from
 * `ctx.state.ownerRegistryIds` (populated by the middleware) — the client
 * cannot claim a registry it doesn't own.
 *
 * 404 when the registry has no subscription row / Polar customer id yet
 * (nothing to manage — e.g. the "manage" action reached a free registry).
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

    const url = await createPortalSession(registryId);
    if (!url) {
      return Response.json(
        { error: "No subscription found for this registry" },
        { status: 404 },
      );
    }
    return Response.json({ url });
  },
});
