import { define } from "../../../utils.ts";
import {
  createExercise,
  createTransaction,
  getActiveTransactions,
  calculateFullPairwiseBalances,
} from "../../../lib/store.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) {
      return Response.json({ exercises: [] });
    }
    const { getExercises } = await import("../../../lib/store.ts");
    const exercises = await getExercises(registryId);
    return Response.json({ exercises });
  },
  async POST(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    const userId = ctx.state.user?.id;
    if (!registryId || !userId) {
      const accept = ctx.req.headers.get("Accept") ?? "";
      if (accept.includes("application/json")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return ctx.redirect("/dashboard");
    }

    const active = await getActiveTransactions(registryId);
    if (active.length === 0) {
      const accept = ctx.req.headers.get("Accept") ?? "";
      if (accept.includes("application/json")) {
        return Response.json({ exercise: null, transactions: [] });
      }
      return ctx.redirect("/dashboard");
    }

    const users = ctx.state.participants;
    const debts = calculateFullPairwiseBalances(active, users);

    const exercise = await createExercise(registryId);

    for (const debt of debts) {
      await createTransaction({
        registry_id: registryId,
        description: `Pendiente de ${debt.fromUserName} a favor de ${debt.toUserName}`,
        amount: debt.amount,
        originalAmount: debt.amount,
        type: "ajuste" as const,
        relatedTransactionId: null,
        exerciseId: null,
        installmentCurrent: null,
        installmentTotal: null,
        recurringDisabled: false,
        recurringGroupId: crypto.randomUUID(),
        notes: "Ajuste de balance pendiente del ejercicio anterior",
        splitJson: {
          splits: [{
            userId: debt.fromUserId,
            percentage: 100,
            amount: debt.amount,
          }],
        },
        creatorId: debt.toUserId,
        userPaid: debt.toUserId,
      }, userId);
    }

    const accept = ctx.req.headers.get("Accept") ?? "";
    if (accept.includes("application/json")) {
      return Response.json({ exercise, transactions: debts });
    }
    return ctx.redirect("/dashboard");
  },
});
