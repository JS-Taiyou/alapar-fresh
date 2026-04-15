import { define } from "../../../utils.ts";
import { query } from "../../../lib/db.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await ctx.req.json();
    const { endpoint, keys, registryId } = body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      registryId?: string;
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return Response.json({ error: "Missing subscription data" }, {
        status: 400,
      });
    }

    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, registry_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = NOW()`,
      [userId, endpoint, keys.p256dh, keys.auth, registryId ?? null],
    );

    return Response.json({ ok: true });
  },
});
