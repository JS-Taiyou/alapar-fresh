import { define } from "../../../utils.ts";
import {
  deleteRegistry,
  getTransactionCount,
  renameRegistry,
} from "../../../lib/store.ts";

export const handler = define.handlers({
  async PATCH(ctx) {
    const id = ctx.params.id;
    const systemUserId = ctx.state.user?.id;
    if (!systemUserId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isMember = ctx.state.registries.some((r) => r.id === id);
    if (!isMember) {
      return Response.json({ error: "Not a member" }, { status: 403 });
    }

    const body = await ctx.req.json();
    const name = (body.name as string)?.trim();
    if (!name) {
      return Response.json({ error: "Name required" }, { status: 400 });
    }

    const updated = await renameRegistry(id, name, systemUserId);
    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json(updated);
  },

  async DELETE(ctx) {
    const id = ctx.params.id;
    const systemUserId = ctx.state.user?.id;
    if (!systemUserId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isMember = ctx.state.registries.some((r) => r.id === id);
    if (!isMember) {
      return Response.json({ error: "Not a member" }, { status: 403 });
    }

    const txCount = await getTransactionCount(id);
    if (txCount > 0) {
      return Response.json({ error: "Registry has transactions" }, {
        status: 409,
      });
    }

    const deleted = await deleteRegistry(id, systemUserId);
    if (!deleted) {
      return Response.json({ error: "Delete failed" }, { status: 500 });
    }

    return new Response(null, { status: 204 });
  },
});
