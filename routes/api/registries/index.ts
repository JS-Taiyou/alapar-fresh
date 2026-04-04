import { define } from "../../../utils.ts";
import { createRegistry } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const userId = ctx.state.systemUser?.id;
    if (name && userId) {
      await createRegistry(name, userId);
    }
    return ctx.redirect("/dashboard");
  },
});
