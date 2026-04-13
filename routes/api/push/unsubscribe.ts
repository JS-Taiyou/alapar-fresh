import { define } from "../../../utils.ts";
import { query } from "../../../lib/db.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await ctx.req.json();
    const { endpoint } = body as { endpoint: string };

    if (!endpoint) {
      return Response.json({ error: "Missing endpoint" }, { status: 400 });
    }

    await query(
      "DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
      [endpoint, userId],
    );

    return Response.json({ ok: true });
  },
});
