import { define } from "../../../utils.ts";
import {
  deleteTransaction,
  getEntities,
  getTransactionById,
  getTransactionsByIds,
  getUsers,
  updateTransaction,
} from "../../../lib/store.ts";
import { invalidateRegistry } from "../../../lib/server-cache.ts";
import { sendPushToRegistry } from "../../../lib/push.ts";
import { parseTransactionForm } from "../../../lib/transaction-validation.ts";
import { formatMoney } from "../../../lib/format.ts";

export const handler = define.handlers({
  async PUT(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const id = ctx.params.id;
    const tx = await getTransactionById(id);
    if (!tx) {
      return new Response("Not found", { status: 404 });
    }

    const form = await ctx.req.formData();
    const parsed = parseTransactionForm(form);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const data = parsed.data;

    // Cross-reference validation (S7): the payer and every split recipient
    // must be participants of the transaction's registry, and every referenced
    // transaction must live in that same registry.
    const registryId = tx.registry_id;
    const participantIds = registryId === ctx.state.activeRegistry?.id
      ? ctx.state.participants.map((p) => p.id)
      : [
        ...(await getUsers(registryId)).map((u) => u.id),
        ...(await getEntities(registryId, userId)).map((e) => e.id),
      ];
    if (!participantIds.includes(data.userPaid)) {
      return Response.json({ error: "Usuario pagador inválido" }, {
        status: 400,
      });
    }
    const splitUserIds = data.splitJson.splits.map((s) => s.userId);
    if (splitUserIds.some((id2) => !participantIds.includes(id2))) {
      return Response.json({ error: "Participante inválido en el split" }, {
        status: 400,
      });
    }

    const refIds = [
      ...(data.relatedTransactionId ? [data.relatedTransactionId] : []),
      ...(data.transactionPaymentEntries ?? []).map((e) => e.expenseId),
    ];
    if (refIds.length > 0) {
      const refs = await getTransactionsByIds(refIds);
      const refRegistryById = new Map(refs.map((t) => [t.id, t.registry_id]));
      if (refIds.some((refId) => refRegistryById.get(refId) !== registryId)) {
        return Response.json({ error: "Referencia inválida" }, {
          status: 400,
        });
      }
    }

    const updated = await updateTransaction(
      id,
      {
        description: data.description,
        amount: data.amount,
        originalAmount: data.originalAmount,
        type: data.type,
        notes: data.notes,
        splitJson: data.splitJson,
        userPaid: data.userPaid,
        installmentCurrent: data.installmentCurrent,
        installmentTotal: data.installmentTotal,
        relatedTransactionId: data.relatedTransactionId,
      },
      userId,
      data.transactionPaymentEntries,
    );
    if (!updated) {
      return new Response("Forbidden", { status: 403 });
    }

    invalidateRegistry(tx.registry_id);

    sendPushToRegistry(tx.registry_id, {
      title: "Transacción actualizada",
      body: `${data.description} — $${formatMoney(data.originalAmount)}`,
      registryId: tx.registry_id,
      url: "/dashboard",
    }, userId).catch(() => {});

    return Response.json(updated);
  },
  async DELETE(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const id = ctx.params.id;
    const tx = await getTransactionById(id);
    const deleted = await deleteTransaction(id, userId);
    if (!deleted) {
      return new Response("Not found or forbidden", { status: 404 });
    }

    if (tx) {
      invalidateRegistry(tx.registry_id);

      sendPushToRegistry(tx.registry_id, {
        title: "Transacción eliminada",
        body: tx.description,
        registryId: tx.registry_id,
        url: "/dashboard",
      }, userId).catch(() => {});
    }

    return new Response(null, { status: 204 });
  },
});
