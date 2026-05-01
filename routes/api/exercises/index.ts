import { define } from "../../../utils.ts";
import {
  calculateFullPairwiseBalances,
  createExercise,
  createTransaction,
  getActiveTransactions,
  getEntities,
  getUsers,
  isMemberOfRegistry,
} from "../../../lib/store.ts";
import { invalidateRegistry } from "../../../lib/server-cache.ts";

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
    let body: { registryId?: unknown } = {};
    const hasJsonBody =
      (ctx.req.headers.get("content-type") ?? "").includes("application/json");
    if (hasJsonBody) {
      try {
        body = await ctx.req.json();
      } catch {
        const accept = ctx.req.headers.get("Accept") ?? "";
        if (accept.includes("application/json")) {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        return ctx.redirect("/dashboard");
      }
    }

    const requestedRegistryId = typeof body.registryId === "string"
      ? body.registryId
      : undefined;
    const registryId = requestedRegistryId ?? ctx.state.activeRegistry?.id;
    const userId = ctx.state.user?.id;
    if (!registryId || !userId) {
      const accept = ctx.req.headers.get("Accept") ?? "";
      if (accept.includes("application/json")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return ctx.redirect("/dashboard");
    }

    if (
      requestedRegistryId &&
      requestedRegistryId !== ctx.state.activeRegistry?.id
    ) {
      const member = await isMemberOfRegistry(userId, registryId);
      if (!member) {
        const accept = ctx.req.headers.get("Accept") ?? "";
        if (accept.includes("application/json")) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        return ctx.redirect("/dashboard");
      }
    }

    const active = await getActiveTransactions(registryId);
    if (active.length === 0) {
      const accept = ctx.req.headers.get("Accept") ?? "";
      if (accept.includes("application/json")) {
        return Response.json({ exercise: null, transactions: [] });
      }
      return ctx.redirect("/dashboard");
    }

    const [users, entities] = await Promise.all([
      getUsers(registryId),
      getEntities(registryId),
    ]);
    const participants = [
      ...users.map((u) => ({ id: u.id, name: u.name, color: u.color })),
      ...entities.map((e) => ({ id: e.id, name: e.name, color: e.color })),
    ];
    const debts = calculateFullPairwiseBalances(active, participants);

    const exercise = await createExercise(registryId);

    invalidateRegistry(registryId);

    for (const debt of debts) {
      await createTransaction({
        registry_id: registryId,
        description:
          `Pendiente de ${debt.fromUserName} a favor de ${debt.toUserName}`,
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
