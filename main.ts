import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import {
  createUserFromSupabase,
  ensureUserPreferences,
  resolveUserState,
} from "./lib/store.ts";
import { getUserFromRequest } from "./lib/supabase.ts";
import { query } from "./lib/db.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use(define.middleware(async (ctx) => {
  ctx.state.systemUser = null;
  ctx.state.activeRegistry = null;
  ctx.state.registries = [];
  ctx.state.registryUsers = [];
  ctx.state.supabaseAuthId = null;
  ctx.state.isOwner = false;

  const authUser = await getUserFromRequest(ctx.req);
  if (!authUser) return await ctx.next();

  ctx.state.supabaseAuthId = authUser.id;

  const state = await resolveUserState(authUser.id);

  if (!state.systemUser) {
    const systemUser = await createUserFromSupabase(
      authUser.id,
      authUser.email,
      authUser.name ?? authUser.email.split("@")[0],
    );
    await ensureUserPreferences(systemUser.id);
    ctx.state.systemUser = systemUser;
    return await ctx.next();
  }

  if (!state.isEmailAllowed) {
    return ctx.redirect("/login?error=unauthorized");
  }

  if (authUser.name && state.systemUser.name !== authUser.name) {
    await Promise.all([
      query(
        "UPDATE system_users SET name = $1 WHERE id = $2",
        [authUser.name, state.systemUser.id],
      ),
      query(
        "UPDATE users SET name = $1 WHERE system_user_id = $2",
        [authUser.name, state.systemUser.id],
      ),
    ]);
    state.systemUser = { ...state.systemUser, name: authUser.name };
  }

  ctx.state.systemUser = state.systemUser;
  ctx.state.registries = state.registries;
  ctx.state.activeRegistry = state.activeRegistry;
  ctx.state.registryUsers = state.registryUsers;
  ctx.state.isOwner = state.isOwner;

  return await ctx.next();
}));

app.use(define.middleware(async (ctx) => {
  const path = new URL(ctx.req.url).pathname;
  const hasUser = ctx.state.systemUser !== null;
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
