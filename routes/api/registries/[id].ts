import { define } from "../../../utils.ts";
import {
  deleteRegistry,
  getRegistriesForUser,
  getTransactionCount,
  renameRegistry,
  setUserActiveRegistry,
} from "../../../lib/store.ts";

export const handler = define.handlers({
  async PATCH(ctx) {
    const id = ctx.params.id;
    const systemUserId = ctx.state.user?.id;
    if (!systemUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isMember = ctx.state.registries.some((r) => r.id === id);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Not a member" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await ctx.req.json();
    const name = (body.name as string)?.trim();
    if (!name) {
      return new Response(JSON.stringify({ error: "Name required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const updated = await renameRegistry(id, name, systemUserId);
    if (!updated) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return Response.json(updated);
  },

  async DELETE(ctx) {
    const id = ctx.params.id;
    const systemUserId = ctx.state.user?.id;
    if (!systemUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isMember = ctx.state.registries.some((r) => r.id === id);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Not a member" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const txCount = await getTransactionCount(id);
    if (txCount > 0) {
      return new Response(
        JSON.stringify({ error: "Registry has transactions" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    const deleted = await deleteRegistry(id, systemUserId);
    if (!deleted) {
      return new Response(JSON.stringify({ error: "Delete failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const remaining = await getRegistriesForUser(systemUserId);
    if (remaining.length > 0) {
      await setUserActiveRegistry(systemUserId, remaining[0].id);
    }

    return new Response(null, { status: 204 });
  },
});
