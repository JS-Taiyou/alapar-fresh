/**
 * Polar billing client — server-side only.
 *
 * Thin zero-dependency REST client over the Polar API (Merchant of Record).
 * Plain fetch with an Organization Access Token (OAT); no SDK (the official
 * one is @next public preview — the three calls we need are simple).
 *
 * Env:
 *   POLAR_ACCESS_TOKEN   — OAT (polar_oat_…), server-side secret
 *   POLAR_WEBHOOK_SECRET — Standard Webhooks signing secret (whsec_… / polar_whsec_…)
 *   POLAR_ENV            — 'sandbox' | 'production' (default sandbox)
 *   POLAR_CHECKOUT_LINK  — dashboard-configured Checkout Link base URL
 *
 * Abstraction seam: everything Polar-specific lives in this file, so a second
 * processor could be added later behind the same functions.
 */

import { query } from "./db.ts";

const POLAR_API: Record<string, string> = {
  sandbox: "https://sandbox-api.polar.sh/v1",
  production: "https://api.polar.sh/v1",
};

function apiBase(): string {
  const env = Deno.env.get("POLAR_ENV") ?? "sandbox";
  return POLAR_API[env] ?? POLAR_API.sandbox;
}

function oat(): string {
  const token = Deno.env.get("POLAR_ACCESS_TOKEN");
  if (!token) throw new Error("POLAR_ACCESS_TOKEN env var is required");
  return token;
}

export function billingConfigured(): boolean {
  return !!(Deno.env.get("POLAR_ACCESS_TOKEN") &&
    Deno.env.get("POLAR_CHECKOUT_LINK"));
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Build the Checkout Link URL for upgrading a registry.
 * The link (products, trial, success URL) is configured in the Polar
 * dashboard; we only append metadata so the webhook can map back.
 */
export function getCheckoutUrl(
  registryId: string,
  interval: "monthly" | "yearly",
  locale: string,
): string {
  const base = Deno.env.get("POLAR_CHECKOUT_LINK");
  if (!base) throw new Error("POLAR_CHECKOUT_LINK env var is required");
  const url = new URL(base);
  url.searchParams.set("metadata[registry_id]", registryId);
  url.searchParams.set("reference_id", registryId);
  url.searchParams.set("locale", locale === "en" ? "en" : "es");
  url.searchParams.set("theme", "dark");
  if (interval === "yearly") url.searchParams.set("interval", "yearly");
  return url.toString();
}

/**
 * Fetch a checkout by id to confirm a completed upgrade on the success page
 * (webhooks can lag seconds). Returns the mapped subscription state, or null
 * when the checkout isn't found / isn't successful yet.
 */
export async function syncCheckout(
  checkoutId: string,
): Promise<
  {
    subscriptionId: string | null;
    status: string;
    currentPeriodEnd: string | null;
  } | null
> {
  const res = await fetch(`${apiBase()}/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${oat()}` },
  });
  if (!res.ok) return null;
  const checkout = await res.json() as {
    status: string;
    subscription_id?: string | null;
  };
  if (!checkout.subscription_id) return null;

  // Pull the subscription for period/status detail.
  const subRes = await fetch(
    `${apiBase()}/subscriptions/${checkout.subscription_id}`,
    { headers: { Authorization: `Bearer ${oat()}` } },
  );
  if (!subRes.ok) return null;
  const sub = await subRes.json() as {
    status: string;
    current_period_end: string | null;
  };
  return {
    subscriptionId: checkout.subscription_id,
    status: sub.status,
    currentPeriodEnd: sub.current_period_end ?? null,
  };
}

// ---------------------------------------------------------------------------
// Customer portal (cancel / payment method self-service)
// ---------------------------------------------------------------------------

export async function createPortalSession(): Promise<string | null> {
  const res = await fetch(`${apiBase()}/customer-sessions/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${oat()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) return null;
  const data = await res.json() as { customer_portal_url?: string };
  return data.customer_portal_url ?? null;
}

// ---------------------------------------------------------------------------
// Webhooks — Standard Webhooks spec, HMAC-SHA256, zero-dependency
// ---------------------------------------------------------------------------

const HMAC_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Polar webhook per the Standard Webhooks spec:
 *   webhook-id:      msg_…
 *   webhook-timestamp: unix seconds
 *   webhook-signature: v1,<base64 hmac>
 * signed content: `${id}.${timestamp}.${rawBody}`
 */
export async function verifyWebhook(
  req: Request,
): Promise<{ valid: boolean; payload?: Record<string, unknown> }> {
  const secret = Deno.env.get("POLAR_WEBHOOK_SECRET");
  if (!secret) return { valid: false };

  const msgId = req.headers.get("webhook-id");
  const msgTimestamp = req.headers.get("webhook-timestamp");
  const msgSignature = req.headers.get("webhook-signature");
  if (!msgId || !msgTimestamp || !msgSignature) return { valid: false };

  // Reject stale deliveries (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(msgTimestamp));
  if (!Number.isFinite(age) || age > HMAC_TOLERANCE_SECONDS) {
    return { valid: false };
  }

  const rawBody = await req.text();

  // Decode the whsec_… secret (prefix polar_ is also accepted).
  const secretB64 = secret.replace(/^polar_/, "").replace(/^whsec_/, "");
  const keyBytes = base64Decode(secretB64);

  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent),
  );
  const expected = base64Encode(new Uint8Array(mac));

  // Signature header may carry multiple schemes (v1,…,v1,…); any v1 match wins.
  const passed = msgSignature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && timingSafeEqual(sig, expected);
  });
  if (!passed) return { valid: false };

  try {
    return {
      valid: true,
      payload: JSON.parse(rawBody) as Record<string, unknown>,
    };
  } catch {
    return { valid: false };
  }
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64Decode(b64: string): Uint8Array {
  const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Event → DB upsert
// ---------------------------------------------------------------------------

const GRACE_DAYS = 3;

/**
 * Upsert registry_subscriptions from a subscription lifecycle webhook.
 * The Polar subscription object carries our checkout metadata
 * (metadata.registry_id). On canceled/revoked we grant a short grace period
 * instead of cutting mid-paid-period.
 */
export async function handleSubscriptionEvent(
  payload: Record<string, unknown>,
): Promise<void> {
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return;

  const metadata = (data.metadata ?? {}) as Record<string, string>;
  const registryId = metadata.registry_id;
  if (!registryId) return; // not ours (no registry mapping) — ignore

  const subscriptionId = data.id as string | undefined;
  const status = data.status as string | undefined;
  if (!subscriptionId || !status) return;

  const customerId =
    (data.customer as Record<string, unknown> | undefined)?.id as string ??
      undefined;
  const currentPeriodEnd = (data.current_period_end as string | undefined) ??
    null;

  const graceUntil = status === "canceled" || status === "revoked"
    ? new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await query(
    `INSERT INTO registry_subscriptions
       (registry_id, polar_subscription_id, polar_customer_id, status,
        current_period_end, grace_until, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (registry_id) DO UPDATE SET
       polar_subscription_id = EXCLUDED.polar_subscription_id,
       polar_customer_id = EXCLUDED.polar_customer_id,
       status = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       grace_until = EXCLUDED.grace_until,
       updated_at = now()`,
    [
      registryId,
      subscriptionId,
      customerId,
      status,
      currentPeriodEnd,
      graceUntil,
    ],
  );

  // Flip registries.plan to match (the entitlements read also covers webhook
  // lag, but keeping the column in sync keeps queries and dashboards honest).
  const proAgain = status === "trialing" || status === "active" ||
    status === "past_due";
  if (proAgain) {
    await query(
      `UPDATE registries SET plan = 'pro' WHERE id = $1 AND plan = 'free'`,
      [registryId],
    );
  } else if (status === "canceled" || status === "revoked") {
    // Only demote once the grace window lapses; keep 'pro' during grace.
    // (When grace expires, getRegistryPlan's subscription check stops
    // covering it; a periodic sweep could flip the column then. For now the
    // LEFT JOIN check is authoritative, so the column staying 'pro' briefly
    // is harmless.)
  }
}
