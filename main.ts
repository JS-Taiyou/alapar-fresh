import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import {
  createUserFromSupabase,
  ensureUserPreferences,
  resolveUserState,
} from "./lib/store.ts";
import { getUserFromRequest, setAuthCookies } from "./lib/supabase.ts";
import { query } from "./lib/db.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use(define.middleware(async (ctx) => {
  ctx.state.user = null;
  ctx.state.activeRegistry = null;
  ctx.state.registries = [];
  ctx.state.registryUsers = [];
  ctx.state.entities = [];
  ctx.state.participants = [];
  ctx.state.supabaseAuthId = null;
  ctx.state.isOwner = false;
  ctx.state.ownerRegistryIds = new Set<string>();

  const authResult = await getUserFromRequest(ctx.req);
  if (!authResult) return await ctx.next();

  const authUser = authResult.user;
  ctx.state.supabaseAuthId = authUser.id;

  const path = new URL(ctx.req.url).pathname;
  const needsFullState = path === "/" ||
    path.startsWith("/dashboard") ||
    path.startsWith("/api/registries") ||
    path.startsWith("/api/transactions") ||
    path.startsWith("/api/entities") ||
    path.startsWith("/api/invitations") ||
    path.startsWith("/api/exercises") ||
    path.startsWith("/api/default-split") ||
    path.startsWith("/api/dashboard") ||
    path.startsWith("/api/push");

  if (!needsFullState) {
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
      await ensureUserPreferences(user.id);
      ctx.state.user = user;
    } else {
      const row = userResult.rows[0];
      if (!row.is_email_allowed) {
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
    if (authResult.refreshedTokens && response) {
      setAuthCookies(response.headers, authResult.refreshedTokens.accessToken, authResult.refreshedTokens.refreshToken);
    }
    return response;
  }

  const state = await resolveUserState(authUser.id);

  if (!state.user) {
    const user = await createUserFromSupabase(
      authUser.id,
      authUser.email,
      authUser.name ?? authUser.email.split("@")[0],
    );
    await ensureUserPreferences(user.id);
    ctx.state.user = user;
    const response = await ctx.next();
    if (authResult.refreshedTokens && response) {
      setAuthCookies(response.headers, authResult.refreshedTokens.accessToken, authResult.refreshedTokens.refreshToken);
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
    setAuthCookies(response.headers, authResult.refreshedTokens.accessToken, authResult.refreshedTokens.refreshToken);
  }
  return response;
}));

app.use(define.middleware(async (ctx) => {
  const path = new URL(ctx.req.url).pathname;
  const hasUser = ctx.state.user !== null;
  const hasRegistry = ctx.state.activeRegistry !== null;

  const publicPaths = [
    "/login",
    "/signup",
    "/join",
    "/api/auth/callback",
    "/api/auth/logout",
    "/api/auth/check-email",
  ];
  const isPublic = publicPaths.some((p) => path.startsWith(p));

  if (!hasUser && !isPublic) {
    return ctx.redirect(`/login?redirect=${encodeURIComponent(path)}`);
  }

  if (hasUser && (path === "/login" || path === "/signup")) {
    return ctx.redirect("/");
  }

  if (hasUser && !hasRegistry) {
    if (path.startsWith("/dashboard")) {
      return ctx.redirect("/");
    }
  }

  if (hasUser && hasRegistry && path === "/") {
    return ctx.redirect("/dashboard");
  }

  return await ctx.next();
}));

app.fsRoutes();
