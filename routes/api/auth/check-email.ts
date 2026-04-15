import { define } from "../../../utils.ts";
import { isEmailAllowed } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const email = body.email as string;

    if (!email) {
      return Response.json({ error: "Missing email" }, { status: 400 });
    }

    const allowed = await isEmailAllowed(email);
    return Response.json({ allowed });
  },
});
