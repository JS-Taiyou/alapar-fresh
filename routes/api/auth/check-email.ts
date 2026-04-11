import { define } from "../../../utils.ts";
import { isEmailAllowed } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const email = body.email as string;

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const allowed = await isEmailAllowed(email);
    return new Response(JSON.stringify({ allowed }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
