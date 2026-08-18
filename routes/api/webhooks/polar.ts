import { define } from "../../../utils.ts";
import {
  handleSubscriptionEvent,
  verifyWebhook,
} from "../../../lib/billing.ts";

/**
 * POST /api/webhooks/polar — Polar subscription lifecycle events.
 *
 * PUBLIC endpoint: added to the public-path list in lib/routing.ts and
 * CSRF-exempt in main.ts. Both are safe because authenticity comes from the
 * Standard Webhooks HMAC signature (lib/billing.ts verifyWebhook), not from
 * our session/origin — Polar's servers have no browser session and send no
 * Origin header. It is also NOT in the rate-limit list: Polar retries
 * deliveries and must not be throttled into false failures.
 *
 * STATUS-CODE SEMANTICS (the load-bearing part):
 *   401 invalid signature → Polar does NOT retry. A bad signature can never
 *                           become good by retrying (wrong secret config or
 *                           an attacker) — retrying would mask a
 *                           misconfiguration as flakiness.
 *   500 handler error     → Polar RETRIES with backoff. A transient DB blip
 *                           must not lose a paid activation, so failures
 *                           INSIDE handleSubscriptionEvent surface as 500.
 *   200                   → acknowledged. The handler is idempotent:
 *                           at-least-once redelivery just re-upserts the same
 *                           row (keyed on registry_id).
 *
 * Event routing: we act on `subscription.*` only; other event types
 * (product/customer/…) are acknowledged and ignored, so Polar doesn't retry
 * forever on events we never opted into.
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
