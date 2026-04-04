import { define } from "../../../utils.ts";
import { setSystemUser } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const email = form.get("email") as string;

    if (name && email) {
      await setSystemUser({
        id: crypto.randomUUID(),
        email,
        name,
      });
    }

    return ctx.redirect("/");
  },
});
