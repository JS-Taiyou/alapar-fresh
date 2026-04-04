import { define } from "../../../utils.ts";
import { setUserActiveRegistry } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const registryId = body.registryId as string;
    const systemUserId = ctx.state.systemUser?.id;

    if (!registryId || !systemUserId) {
      return new Response(JSON.stringify({ error: "Missing data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isMember = ctx.state.registries.some((r) => r.id === registryId);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Not a member" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await setUserActiveRegistry(systemUserId, registryId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
