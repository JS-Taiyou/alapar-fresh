import { define } from "../../../utils.ts";
import { setUserActiveRegistry } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const registryId = body.registryId as string;
    const userId = ctx.state.user?.id;

    if (!registryId || !userId) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    const isMember = ctx.state.registries.some((r) => r.id === registryId);
    if (!isMember) {
      return Response.json({ error: "Not a member" }, { status: 403 });
    }

    await setUserActiveRegistry(userId, registryId);

    return Response.json({ ok: true });
  },
});
