import { define } from "../../../utils.ts";
import {
  handleSubscriptionEvent,
  verifyWebhook,
} from "../../../lib/billing.ts";

/**
 * POST /api/webhooks/polar — Polar subscription lifecycle events.
 *
 * PUBLIC endpoint (added to routing's public list + csrf-exempt + rate-limit
 * exempt in main.ts): authenticity comes from the Standard Webhooks HMAC
 * signature, not from our session. Polar retries on non-2xx, so signature
 * failures return 401 (permanent — retrying won't help) while internal
 * errors return 500 (retryable).
 */
export const handler = define.handlers({
  async POST(ctx) {
    const { valid, payload } = await verifyWebhook(ctx.req);
    if (!valid || !payload) {
      return new Response("invalid signature", { status: 401 });
    }

    const type = payload.type as string | undefined;
    if (typeof type === "string" && type.startsWith("subscription.")) {
      try {
        await handleSubscriptionEvent(payload);
      } catch (err) {
        console.error("[billing] webhook handler failed:", err);
        return new Response("handler error", { status: 500 });
      }
    }

    // Ack everything else (product/customer events we don't act on).
    return Response.json({ received: true });
  },
});
