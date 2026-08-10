import { App, csrf, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { createUserFromSupabase, resolveUserState } from "./lib/store.ts";
import { getUserFromRequest, setAuthCookies } from "./lib/supabase.ts";
import { query } from "./lib/db.ts";
import { needsFullState, routeGuard } from "./lib/routing.ts";

const isDev = !Deno.env.get("DENO_DEPLOYMENT_ID");
function devLog(...args: unknown[]) {
  if (isDev) console.log("[MW]", ...args);
}

export const app = new App<State>();

app.use(staticFiles());
app.use(csrf({
  origin: (origin, ctx) => {
    if (ctx.url.pathname === "/api/auth/callback") return true;
    if (ctx.url.pathname === "/api/auth/check-email") return true;
    return origin === ctx.url.origin;
  },
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
