import { define } from "../../../utils.ts";
import { useInvitation as acceptInvitation } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const code = body.code as string;
    const systemUserId = ctx.state.user?.id;

    if (!code || !systemUserId) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    try {
      const registryId = await acceptInvitation(code, systemUserId);
      return Response.json({ registryId });
    } catch (err) {
      return Response.json({
        error: err instanceof Error ? err.message : "Unknown error",
      }, { status: 400 });
    }
  },
});
