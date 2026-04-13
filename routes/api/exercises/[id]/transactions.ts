import { define } from "../../../../utils.ts";
import { getTransactionsByExercise } from "../../../../lib/store.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const exerciseId = ctx.params.id;
    if (!exerciseId) {
      return Response.json({ error: "Missing exercise id" }, { status: 400 });
    }

    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transactions = await getTransactionsByExercise(exerciseId);
    return Response.json({ transactions });
  },
});
