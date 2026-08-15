/**
 * Polar billing client — SERVER-SIDE ONLY.
 *
 * Thin zero-dependency REST client over the Polar API (Merchant of Record:
 * Polar handles cards, tax/VAT, and payouts — we never touch payment data).
 * Plain `fetch` with an Organization Access Token (OAT); no SDK (the official
 * one is @next public preview, and the three calls we need are simple).
 *
 * Environment variables (see .env.example):
 *   POLAR_ACCESS_TOKEN   — OAT (`polar_oat_…`). Grants FULL org API access.
 *                          Equivalent to an admin credential: never expose it
 *                          to the client bundle, logs, or error messages.
 *   POLAR_WEBHOOK_SECRET — Standard Webhooks signing secret (`whsec_…` /
 *                          `polar_whsec_…`). Only validates webhooks; lower
 *                          blast radius if leaked (an attacker could only
 *                          forge events to us, not read/write the org).
 *   POLAR_ENV            — 'sandbox' | 'production'. Defaults to sandbox so a
 *                          missing var can never accidentally hit live money.
 *   POLAR_CHECKOUT_LINK  — Dashboard-configured Checkout Link base URL.
 *                          Products, pricing, trial, and the success URL all
 *                          live in the Polar dashboard — changing pricing is a
 *                          dashboard change, not a deploy.
 *
 * Abstraction seam: everything Polar-specific lives in this file. A second
 * processor (Stripe, MercadoPago) could be added later behind the same
 * function signatures — the rest of the app only knows `entitlements.ts`.
 */

import { query } from "./db.ts";

const POLAR_API: Record<string, string> = {
  sandbox: "https://sandbox-api.polar.sh/v1",
  production: "https://api.polar.sh/v1",
};

function apiBase(): string {
  const env = Deno.env.get("POLAR_ENV") ?? "sandbox";
  // Unknown values fall back to sandbox — fail-safe, never fail-open.
  return POLAR_API[env] ?? POLAR_API.sandbox;
}

function oat(): string {
  const token = Deno.env.get("POLAR_ACCESS_TOKEN");
  if (!token) throw new Error("POLAR_ACCESS_TOKEN env var is required");
  return token;
}

/** True when checkout redirects can work (token + link present). */
export function billingConfigured(): boolean {
  return !!(Deno.env.get("POLAR_ACCESS_TOKEN") &&
    Deno.env.get("POLAR_CHECKOUT_LINK"));
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Build the Checkout Link URL for upgrading a registry.
 *
 * The link itself (which products, prices, trial length, success URL) is
 * configured once in the Polar dashboard. We append:
 *
 *   metadata[registry_id] — the critical piece: Polar echoes this back on
 *                           every subscription webhook, letting us map a
 *                           payment to the billed registry with no lookup
 *                           table of our own.
 *   reference_id          — same value; shown in the Polar dashboard on the
 *                           order/subscription for human debugging.
 *   locale / theme        — match the app language and dark palette.
 *   interval=yearly       — only when the user picked yearly; monthly is the
 *                           link's default.
 *
 * SECURITY: `registryId` here comes from our own owner-checked route — a user
 * cannot pass an arbitrary registry via the query string of the checkout
 * route (the route validates ownership before calling this).
 */
export function getCheckoutUrl(
  registryId: string,
  interval: "monthly" | "yearly",
  locale: string,
): string {
  const monthly = Deno.env.get("POLAR_CHECKOUT_LINK");
  if (!monthly) throw new Error("POLAR_CHECKOUT_LINK env var is required");
  // Yearly uses a dedicated link when configured. Polar's documented query
  // params do NOT include `interval`, so reliably preselecting the yearly
  // product means a second Checkout Link pointed at the yearly product
  // (POLAR_CHECKOUT_LINK_YEARLY). The ?interval=yearly param below is still
  // appended for dashboards/links that do honor it — harmless if dropped.
  const base = interval === "yearly"
    ? Deno.env.get("POLAR_CHECKOUT_LINK_YEARLY") ?? monthly
    : monthly;
  const url = new URL(base);
  url.searchParams.set("metadata[registry_id]", registryId);
  url.searchParams.set("reference_id", registryId);
  url.searchParams.set("locale", locale === "en" ? "en" : "es");
  url.searchParams.set("theme", "dark");
  if (interval === "yearly") url.searchParams.set("interval", "yearly");
  return url.toString();
}

/**
 * Fetch a checkout by id to confirm a completed upgrade on the success page.
 *
 * Why this exists: webhooks are the source of truth but can lag several
 * seconds behind the browser redirect. The success page polls this so the
 * user sees "Pro activado" immediately instead of a pending state.
 *
 * Returns the mapped subscription state, or null when the checkout isn't
 * found / isn't successful yet. NOTE: this performs NO database writes — the
 * authoritative write is the webhook; this read is display-only. A user
 * landing on /billing/success with a hand-crafted checkout_id gains nothing:
 * the page only shows a message, and entitlements still come from the DB.
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
  // No subscription attached yet → checkout not completed (or abandoned).
  if (!checkout.subscription_id) return null;

  // Pull the subscription for status/period detail.
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

/**
 * Create a short-lived hosted Polar customer-portal session.
 *
 * Polar hosts the entire portal (cancel, update card, invoices) — we never
 * render or store payment methods. The returned URL is one-time-use and
 * expires quickly, which is why we hand it back as JSON for an immediate
 * redirect instead of 302-ing (the fetch is same-origin from the island).
 *
 * Polar REQUIRES a customer identifier on this call — an empty body 422s,
 * which is why we look up the `polar_customer_id` we stored at webhook time
 * (`registry_subscriptions.polar_customer_id`) and send it as `customer_id`.
 * Returns null when the registry has no subscription row yet (nothing to
 * manage) or the Polar call fails; the route maps both to an error.
 *
 * Note: Polar scopes customer sessions to the CUSTOMER, not to a registry.
 * A user owning two Pro registries (same Polar customer) gets a portal
 * listing both subscriptions — which is the correct UX.
 */
export async function createPortalSession(
  registryId: string,
): Promise<string | null> {
  const sub = await query(
    `SELECT polar_customer_id FROM registry_subscriptions WHERE registry_id = $1`,
    [registryId],
  );
  const customerId = sub.rows[0]?.polar_customer_id as string | undefined;
  if (!customerId) return null;

  const res = await fetch(`${apiBase()}/customer-sessions/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${oat()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customer_id: customerId }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { customer_portal_url?: string };
  return data.customer_portal_url ?? null;
}

// ---------------------------------------------------------------------------
// Webhooks — Standard Webhooks spec, HMAC-SHA256, zero-dependency
// ---------------------------------------------------------------------------
//
// The webhook endpoint is PUBLIC (no session cookie from Polar's servers), so
// this verifier is the ONLY thing standing between the internet and our
// subscription table. Everything below is deliberate:
//
//   1. Timestamp tolerance  — rejects replays of old (validly-signed)
//                             deliveries captured on the wire.
//   2. Timing-safe compare — constant-time equality so an attacker can't
//                             byte-by-byte forge a signature.
//   3. Multi-scheme parse  — the spec allows "v1,sig1 v1,sig2 …" (multiple
//                             secrets during rotation); we accept any v1 match
//                             but never a non-v1 (future) scheme.
//   4. Fail-closed         — any missing header/secret/parse error ⇒ invalid.
//                             The route turns invalid ⇒ 401 (no retry) vs
//                             handler error ⇒ 500 (retry) — see the route.

/**
 * How old (in seconds) a webhook delivery may be. 5 minutes comfortably
 * covers network + Polar retry latency while making replayed captures from
 * hours ago useless.
 */
const HMAC_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Polar webhook per the Standard Webhooks spec.
 *
 * Headers:
 *   webhook-id:         unique message id (`msg_…`) — part of the signed
 *                       content, so an attacker can't swap ids.
 *   webhook-timestamp:  unix seconds — part of the signed content AND checked
 *                       against the tolerance window above.
 *   webhook-signature:  space-separated `version,base64hmac` entries.
 *
 * Signed content (exact bytes, before JSON parsing):
 *   `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *
 * CRITICAL: the signature covers the RAW request body, not a re-serialized
 * JSON object — the check must run on the exact bytes Polar signed, which is
 * why this reads req.text() here and parses JSON only after verification.
 */
export async function verifyWebhook(
  req: Request,
): Promise<{ valid: boolean; payload?: Record<string, unknown> }> {
  const secret = Deno.env.get("POLAR_WEBHOOK_SECRET");
  if (!secret) return { valid: false }; // fail-closed when unconfigured

  const msgId = req.headers.get("webhook-id");
  const msgTimestamp = req.headers.get("webhook-timestamp");
  const msgSignature = req.headers.get("webhook-signature");
  if (!msgId || !msgTimestamp || !msgSignature) return { valid: false };

  // Replay protection. `abs()` also rejects FUTURE timestamps (skewed-clock
  // forgeries), not just old ones.
  const age = Math.abs(Date.now() / 1000 - Number(msgTimestamp));
  if (!Number.isFinite(age) || age > HMAC_TOLERANCE_SECONDS) {
    return { valid: false };
  }

  // Raw body — must be byte-identical to what Polar signed.
  const rawBody = await req.text();

  // Polar secrets ship as `polar_whsec_…` (or plain `whsec_…`); the spec
  // prefix is not part of the base64 key material. Strip both, re-pad, decode.
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

  // Accept any v1 scheme entry in the header (rotation-friendly). Non-v1
  // schemes (a hypothetical future v2) are ignored, not accepted.
  const passed = msgSignature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && timingSafeEqual(sig, expected);
  });
  if (!passed) return { valid: false };

  // Only parse AFTER the signature is proven — a hostile body can't even
  // trigger a JSON.parse exception before then.
  try {
    return {
      valid: true,
      payload: JSON.parse(rawBody) as Record<string, unknown>,
    };
  } catch {
    return { valid: false };
  }
}

/** Bytes → base64 (binary-safe: builds a binary string first). */
function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** base64 → bytes. Standard Webhooks secrets are unpadded — re-pad first. */
function base64Decode(b64: string): Uint8Array {
  const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Constant-time string equality. XOR-accumulates every byte and only checks
 * the result at the end, so runtime doesn't leak how many leading bytes
 * matched (the classic timing side-channel on signature checks).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Event → DB upsert
// ---------------------------------------------------------------------------

/**
 * How long a dead-or-dying subscription keeps Pro after the webhook lands.
 * Covers dunning (past_due: a single failed charge gets a retry window —
 * we never hard-cut a paying customer over one declined card) and honest
 * "I canceled but the period I paid for isn't over". Three days matches
 * Polar's failed-payment retry cadence closely enough at our scale; it's
 * deliberately short because getRegistryPlan treats within-grace as Pro —
 * this window IS the maximum time any lapsed payment still grants access.
 */
const GRACE_DAYS = 3;

/**
 * Upsert `registry_subscriptions` from a subscription lifecycle webhook.
 *
 * Mapping: the registry comes from `metadata.registry_id` with
 * `reference_id` fallbacks (see the inline comment in the body). Events
 * mapping to no registry are not ours (another product on the same org, or
 * a subscription created outside our checkout) and are ignored.
 *
 * Idempotency: the upsert is keyed on registry_id (PK), so Polar's at-least-
 * once redelivery just overwrites the same row with the same values.
 *
 * Status → effect:
 *   trialing / active   → row upserted (no grace); registries.plan flipped
 *                         'free'→'pro'. The column is a fast path — the
 *                         subscription JOIN in getRegistryPlan stays
 *                         authoritative in BOTH directions.
 *   past_due            → row upserted with grace_until = now + 3d; Pro
 *                         continues while grace holds (dunning window).
 *   canceled / revoked  → row upserted with grace_until = now + 3d; the plan
 *                         column is intentionally LEFT AS-IS — no cron
 *                         sweeper exists because none is needed:
 *                         getRegistryPlan demotes plan='pro' to free once
 *                         grace_until lapses (its matrix checks the
 *                         subscription before trusting the column). The
 *                         column self-heals on the next resubscribe.
 */
export async function handleSubscriptionEvent(
  payload: Record<string, unknown>,
): Promise<void> {
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return;

  const metadata = (data.metadata ?? {}) as Record<string, string>;
  // Map the payment back to a registry. `metadata[registry_id]` on the
  // checkout link is the primary channel, but Polar's DOCUMENTED query-param
  // list for checkout links does not include metadata[…] — only
  // `reference_id`. reference_id propagates from checkout to the order AND
  // (per the subscriptions API) to the subscription object, so we accept it
  // from three positions, in order of preference. The runbook requires an
  // end-to-end sandbox check of which channel actually fires — this fallback
  // makes the mapping robust either way. Events with none of them are not
  // ours (another product on the org, or a checkout created elsewhere).
  const registryId = metadata.registry_id ??
    (typeof data.reference_id === "string" ? data.reference_id : undefined) ??
    metadata.reference_id;
  if (!registryId) return;

  const subscriptionId = data.id as string | undefined;
  const status = data.status as string | undefined;
  if (!subscriptionId || !status) return;

  const customerId =
    (data.customer as Record<string, unknown> | undefined)?.id as string ??
      undefined;
  const currentPeriodEnd = (data.current_period_end as string | undefined) ??
    null;

  // Grace is set on past_due too, not just canceled/revoked: a single failed
  // charge (card expired, bank decline) must not hard-cut a paying customer
  // while Polar retries. The window bounds the maximum time ANY lapsed
  // payment still grants access — see getRegistryPlan's matrix.
  const graceUntil = status === "canceled" || status === "revoked" ||
      status === "past_due"
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

  const proAgain = status === "trialing" || status === "active" ||
    status === "past_due";
  if (proAgain) {
    // Only ever upgrade the column here (WHERE plan = 'free') — never touch
    // 'grandfathered', which is a permanent state by design.
    await query(
      `UPDATE registries SET plan = 'pro' WHERE id = $1 AND plan = 'free'`,
      [registryId],
    );
  }
  // canceled/revoked/past_due beyond grace: deliberately no plan-column
  // write. getRegistryPlan demotes plan='pro' → free when the subscription
  // row is dead and grace has lapsed, so entitlements expire on READ with
  // zero background jobs. (See the matrix in lib/entitlements.ts.)
}
