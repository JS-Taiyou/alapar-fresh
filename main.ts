import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { getSystemUser, getActiveRegistry, getRegistries, getUsers } from "./lib/store.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use(define.middleware(async (ctx) => {
  ctx.state.systemUser = await getSystemUser();
  ctx.state.activeRegistry = await getActiveRegistry() ?? null;
  ctx.state.registries = [];
  ctx.state.registryUsers = [];

  if (ctx.state.systemUser && ctx.state.activeRegistry) {
    ctx.state.registries = await getRegistries();
    ctx.state.registryUsers = await getUsers(ctx.state.activeRegistry.id);
  }

  return await ctx.next();
}));

app.use(define.middleware(async (ctx) => {
  const path = new URL(ctx.req.url).pathname;
  const hasUser = ctx.state.systemUser !== null;
  const hasRegistry = ctx.state.activeRegistry !== null;

  const isApiSetup = path === "/api/users/setup";
  const isSetup = path === "/setup";

  if (!hasUser && !isSetup && !isApiSetup) {
    return ctx.redirect("/setup");
  }

  if (isSetup && hasUser) {
    return ctx.redirect("/");
  }

  if (hasUser && !hasRegistry) {
    if (path.startsWith("/dashboard")) {
      return ctx.redirect("/");
    }
    if (path === "/" && !isSetup) {
      // Let "/" render — it shows "Nuevo registro" link
    }
  }

  if (hasUser && hasRegistry && (path === "/" || path === "/setup")) {
    return ctx.redirect("/dashboard");
  }

  return await ctx.next();
}));

app.fsRoutes();
