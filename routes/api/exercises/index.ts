import { define } from "../../../utils.ts";
import {
  createExercise,
  createTransaction,
  getActiveTransactions,
  calculateFullPairwiseBalances,
} from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) return ctx.redirect("/dashboard");

    const active = await getActiveTransactions(registryId);
    if (active.length === 0) return ctx.redirect("/dashboard");

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
      });
    }

    return ctx.redirect("/dashboard");
  },
});
