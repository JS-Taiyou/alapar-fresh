import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import {
  createUserFromSupabase,
  ensureUserPreferences,
  getRegistriesForUser,
  getUserActiveRegistry,
  getUserBySupabaseId,
  getUsers,
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

  const ALLOWED_EMAILS = ["jpsb23@gmail.com", "itzapicm@gmail.com"];
  if (!ALLOWED_EMAILS.includes(authUser.email)) {
    return ctx.redirect("/login?error=unauthorized");
  }

  ctx.state.supabaseAuthId = authUser.id;

  let systemUser = await getUserBySupabaseId(authUser.id);
  if (!systemUser) {
    systemUser = await createUserFromSupabase(
      authUser.id,
      authUser.email,
      authUser.email.split("@")[0],
    );
    await ensureUserPreferences(systemUser.id);
  }
  ctx.state.systemUser = systemUser;

  ctx.state.registries = await getRegistriesForUser(systemUser.id);

  const activeRegistry = await getUserActiveRegistry(systemUser.id);
  if (activeRegistry) {
    ctx.state.activeRegistry = activeRegistry;
    ctx.state.registryUsers = await getUsers(activeRegistry.id);

    const roleResult = await query(
      "SELECT role FROM registry_members WHERE registry_id = $1 AND user_id = $2",
      [activeRegistry.id, systemUser.id],
    );
    ctx.state.isOwner = roleResult.rows.length > 0 &&
      roleResult.rows[0].role === "owner";
  }

  return await ctx.next();
}));

app.use(define.middleware(async (ctx) => {
  const path = new URL(ctx.req.url).pathname;
  const hasUser = ctx.state.systemUser !== null;
  const hasRegistry = ctx.state.activeRegistry !== null;

  const publicPaths = [
    "/login",
    "/signup",
    "/api/auth/callback",
    "/api/auth/logout",
  ];
  const isPublic = publicPaths.some((p) => path.startsWith(p));

  if (!hasUser && !isPublic) {
    return ctx.redirect("/login");
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
