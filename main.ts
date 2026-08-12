import { App, csrf, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import {
  createUserFromSupabase,
  isEmailAllowed,
  resolveUserState,
} from "./lib/store.ts";
import { getUserFromRequest, setAuthCookies } from "./lib/supabase.ts";
import { getCookie } from "./lib/auth-cookies.ts";
import { query } from "./lib/db.ts";
import { needsFullState, routeGuard } from "./lib/routing.ts";

const isDev = !Deno.env.get("DENO_DEPLOYMENT_ID");
function devLog(...args: unknown[]) {
  if (isDev) console.log("[MW]", ...args);
}

export const app = new App<State>();

app.use(staticFiles());
// No CSRF exemptions: every mutating endpoint must send a matching Origin.
// The auth callback/check-email fetch calls are same-origin, so they pass.
app.use(csrf({
  origin: (origin, ctx) => origin === ctx.url.origin,
}));

// Security headers on every (non-static) response. No CSP: islands rely on
// inline scripts.
app.use(define.middleware(async (ctx) => {
  const response = await ctx.next();
  const headers = response.headers;
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}));

// Minimal per-IP sliding-window rate limit for the most abuse-prone public
// endpoints (invite acceptance + auth token/check-email endpoints).
// Caveat: on Deno Deploy each isolate keeps its own Map, so the limit is
// per-isolate rather than global — a first-line throttle, not a hard cap.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimitHits = new Map<string, number[]>();
let rateLimitLastSweep = Date.now();

function isRateLimitedRoute(path: string, method: string): boolean {
  if (method === "GET" && (path === "/join" || path.startsWith("/join/"))) {
    return true;
  }
  if (method !== "POST") return false;
  return path === "/api/invitations/join" ||
    path === "/api/auth/check-email" ||
    path === "/api/auth/callback";
}

app.use(define.middleware(async (ctx) => {
  const path = new URL(ctx.req.url).pathname;
  if (!isRateLimitedRoute(path, ctx.req.method)) return ctx.next();

  const now = Date.now();
  // Periodic sweep so the Map can't grow unbounded.
  if (now - rateLimitLastSweep > RATE_LIMIT_WINDOW_MS) {
    rateLimitLastSweep = now;
    for (const [ip, hits] of rateLimitHits) {
      const fresh = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) rateLimitHits.delete(ip);
      else rateLimitHits.set(ip, fresh);
    }
  }

  const ip = ctx.req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  const hits = (rateLimitHits.get(ip) ?? []).filter((t) =>
    now - t < RATE_LIMIT_WINDOW_MS
  );
  if (hits.length >= RATE_LIMIT_MAX) {
    return new Response("Too Many Requests", { status: 429 });
  }
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return await ctx.next();
}));

app.use(define.middleware(async (ctx) => {
  const path = new URL(ctx.req.url).pathname;
  devLog(`>> REQUEST ${ctx.req.method} ${path}`);

  ctx.state.user = null;
  ctx.state.activeRegistry = null;
  ctx.state.registries = [];
  ctx.state.registryUsers = [];
  ctx.state.entities = [];
  ctx.state.participants = [];
  ctx.state.supabaseAuthId = null;
  ctx.state.accessToken = null;
  ctx.state.isOwner = false;
  ctx.state.ownerRegistryIds = new Set<string>();

  // /demo renders entirely from static JSON — skip auth + DB entirely.
  if (path === "/demo") {
    devLog("  Demo page, skipping auth");
    const response = await ctx.next();
    devLog(
      `<< RESPONSE ${ctx.req.method} ${path} (demo, status=${response?.status})`,
    );
    return response;
  }

  devLog("  Getting user from request...");
  const authResult = await getUserFromRequest(ctx.req);
  if (!authResult) {
    devLog("  No auth result, continuing without user");
    const response = await ctx.next();
    devLog(
      `<< RESPONSE ${ctx.req.method} ${path} (no user, status=${response?.status})`,
    );
    return response;
  }

  const authUser = authResult.user;
  ctx.state.supabaseAuthId = authUser.id;
  // Stash the validated access token (the refreshed one when the middleware
  // just renewed it) so /api/auth/token can serve it without re-validating
  // against possibly-spent cookies.
  ctx.state.accessToken = authResult.refreshedTokens?.accessToken ??
    getCookie(ctx.req.headers.get("cookie") ?? "", "sb-access-token");
  devLog(`  Authed user: ${authUser.email}`);

  const fullStateNeeded = needsFullState(path);

  if (!fullStateNeeded) {
    devLog("  Lightweight path, querying user...");
    const userResult = await query(
      `SELECT u.*, ae.id IS NOT NULL as is_email_allowed
       FROM users u
       LEFT JOIN allowed_emails ae ON ae.email = u.email
       WHERE u.supabase_auth_id = $1`,
      [authUser.id],
    );
    if (userResult.rows.length === 0) {
      // First request from a never-seen Supabase user: enforce the allowlist
      // BEFORE inserting the users row (previously the row was created first
      // and the check only caught up on the next request).
      const allowed = await isEmailAllowed(authUser.email);
      if (!allowed) {
        devLog("  Email not allowed (first request), redirecting to login");
        return ctx.redirect("/login?error=unauthorized");
      }
      const user = await createUserFromSupabase(
        authUser.id,
        authUser.email,
        authUser.name ?? authUser.email.split("@")[0],
      );
      ctx.state.user = user;
      devLog("  Created new user:", user.email);
    } else {
      const row = userResult.rows[0];
      if (!row.is_email_allowed) {
        devLog("  Email not allowed, redirecting to login");
        return ctx.redirect("/login?error=unauthorized");
      }
      if (authUser.name && row.name !== authUser.name) {
        await query(
          "UPDATE users SET name = $1 WHERE supabase_auth_id = $2",
          [authUser.name, authUser.id],
        );
        row.name = authUser.name;
      }
      ctx.state.user = {
        id: row.id as string,
        email: row.email as string,
        name: row.name as string,
        color: row.color as string,
        supabaseAuthId: row.supabase_auth_id as string,
        createdAt: row.created_at as Date,
      };
    }
    const response = await ctx.next();
    devLog(
      `<< RESPONSE ${ctx.req.method} ${path} (lightweight, status=${response?.status})`,
    );
    if (authResult.refreshedTokens && response) {
      devLog("  Setting refreshed cookies");
      setAuthCookies(
        response.headers,
        authResult.refreshedTokens.accessToken,
        authResult.refreshedTokens.refreshToken,
      );
    }
    return response;
  }

  devLog("  Full state path, resolving...");
  const state = await resolveUserState(authUser.id);
  devLog(
    "  State resolved, user:",
    state.user?.email,
    "emailAllowed:",
    state.isEmailAllowed,
    "hasRegistry:",
    !!state.activeRegistry,
  );

  if (!state.user) {
    // Same first-request allowlist gate as the lightweight branch above:
    // never insert a users row for an email that isn't in allowed_emails.
    const allowed = await isEmailAllowed(authUser.email);
    if (!allowed) {
      return ctx.redirect("/login?error=unauthorized");
    }
    const user = await createUserFromSupabase(
      authUser.id,
      authUser.email,
      authUser.name ?? authUser.email.split("@")[0],
    );
    ctx.state.user = user;
    const response = await ctx.next();
    if (authResult.refreshedTokens && response) {
      setAuthCookies(
        response.headers,
        authResult.refreshedTokens.accessToken,
        authResult.refreshedTokens.refreshToken,
      );
    }
    return response;
  }

  if (!state.isEmailAllowed) {
    return ctx.redirect("/login?error=unauthorized");
  }

  if (authUser.name && state.user.name !== authUser.name) {
    await query(
      "UPDATE users SET name = $1 WHERE id = $2",
      [authUser.name, state.user.id],
    );
    state.user = { ...state.user, name: authUser.name };
  }

  ctx.state.user = state.user;
  ctx.state.registries = state.registries;
  ctx.state.activeRegistry = state.activeRegistry;
  ctx.state.registryUsers = state.registryUsers;
  ctx.state.entities = state.entities;
  ctx.state.participants = state.participants;
  ctx.state.isOwner = state.isOwner;
  ctx.state.ownerRegistryIds = state.ownerRegistryIds;

  const response = await ctx.next();
  if (authResult.refreshedTokens && response) {
    setAuthCookies(
      response.headers,
      authResult.refreshedTokens.accessToken,
      authResult.refreshedTokens.refreshToken,
    );
  }
  return response;
}));

app.use(define.middleware(async (ctx) => {
  const path2 = new URL(ctx.req.url).pathname;
  const hasUser = ctx.state.user !== null;
  let hasRegistry = ctx.state.activeRegistry !== null;

  // On the lightweight path (e.g. "/"), activeRegistry isn't resolved. Do a
  // single cheap existence check so we can still redirect authed users with a
  // registry to /dashboard without the full 4-query resolveUserState.
  if (hasUser && !hasRegistry && path2 === "/") {
    const membership = await query(
      "SELECT 1 FROM registry_members WHERE user_id = $1 LIMIT 1",
      [ctx.state.user!.id],
    );
    hasRegistry = membership.rows.length > 0;
  }

  devLog(
    `>> ROUTING ${ctx.req.method} ${path2} hasUser=${hasUser} hasRegistry=${hasRegistry}`,
  );

  const redirect = routeGuard(path2, { hasUser, hasRegistry });
  if (redirect) {
    devLog(`<< ROUTING redirect to ${redirect}`);
    return ctx.redirect(redirect);
  }

  devLog(`<< ROUTING ${ctx.req.method} ${path2} continuing to handler`);
  return await ctx.next();
}));

app.onError("*", (ctx) => {
  console.error("Unhandled error:", ctx.error);
  return new Response("Internal Server Error", { status: 500 });
});

app.notFound(() => {
  return new Response("Not Found", { status: 404 });
});

app.fsRoutes();
