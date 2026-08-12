import { define } from "../../../utils.ts";
import { isEmailAllowed } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    // Uniform response shape regardless of outcome: always 200 + { allowed }
    // so error details can't differ between probe attempts (the per-IP rate
    // limit on this route is the actual enumeration mitigation; the signup
    // flow needs the boolean).
    let email: string | undefined;
    try {
      const body = await ctx.req.json();
      email = typeof body?.email === "string" ? body.email : undefined;
    } catch {
      email = undefined;
    }

    const allowed = email ? await isEmailAllowed(email) : false;
    return Response.json({ allowed });
  },
});
