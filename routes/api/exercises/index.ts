import { define } from "../../../utils.ts";
import { createExercise, getActiveTransactions } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    if (registryId) {
      const active = await getActiveTransactions(registryId);
      if (active.length > 0) {
        await createExercise(registryId);
      }
    }
    return ctx.redirect("/dashboard");
  },
});
