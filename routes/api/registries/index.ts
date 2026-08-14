import { define } from "../../../utils.ts";
import { createRegistry, getRegistriesForUser } from "../../../lib/store.ts";
import {
  countOwnedRegistries,
  FREE_LIMITS,
  upgradeRequired,
} from "../../../lib/entitlements.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const registries = await getRegistriesForUser(userId);
    return Response.json({
      registries,
      activeRegistryId: ctx.state.activeRegistry?.id ?? null,
    });
  },
  async POST(ctx) {
    const accept = ctx.req.headers.get("Accept") ?? "";
    const isJson = accept.includes("application/json") ||
      ctx.req.headers.get("Content-Type")?.includes("application/json");

    let name: string;
    if (isJson) {
      const body = await ctx.req.json();
      name = body.name;
    } else {
      const form = await ctx.req.formData();
      name = form.get("name") as string;
    }

    const userId = ctx.state.user?.id;
    if (name && userId) {
      // Free plan: cap on owned registries.
      const owned = await countOwnedRegistries(userId);
      if (owned >= FREE_LIMITS.maxOwnedRegistries) {
        if (isJson) return upgradeRequired("owned_registries");
        return ctx.redirect("/dashboard?upgrade=registries");
      }

      const registry = await createRegistry(name, userId);
      if (isJson) {
        return Response.json({ registry });
      }
    }

    if (isJson) {
      return Response.json({ error: "Missing name" }, { status: 400 });
    }
    return ctx.redirect("/dashboard");
  },
});
