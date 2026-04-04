import { define } from "../../../utils.ts";
import { useInvitation } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const code = body.code as string;
    const systemUserId = ctx.state.systemUser?.id;

    if (!code || !systemUserId) {
      return new Response(JSON.stringify({ error: "Missing data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const registryId = await useInvitation(code, systemUserId);
      return new Response(JSON.stringify({ registryId }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Unknown error",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
});
