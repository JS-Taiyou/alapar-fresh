import { define } from "../../../utils.ts";
import {
  createTransaction,
  getActiveTransactions,
  getEntities,
  getTransactionPaymentsForRegistry,
  getTransactionsByIds,
  getUsers,
} from "../../../lib/store.ts";
import {
  getCachedTransactions,
  invalidateRegistry,
} from "../../../lib/server-cache.ts";
import { sendPushToRegistry } from "../../../lib/push.ts";
import type { TransactionSplit } from "../../../lib/types.ts";
import { generateETag } from "../../../lib/etag.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) {
      return Response.json({ transactions: [] });
    }

    const { transactions } = await getCachedTransactions(
      registryId,
      () => getActiveTransactions(registryId),
    );
    const transactionPayments = await getTransactionPaymentsForRegistry(
      registryId,
    );
    const participantMap = new Map(
      ctx.state.participants.map((p) => [p.id, p]),
    );
    const enriched = transactions.map((tx) => ({
      ...tx,
      paidByUser: participantMap.get(tx.userPaid) ?? null,
    }));

    const etag = generateETag({ enriched, transactionPayments });
    const ifNoneMatch = ctx.req.headers.get("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    return Response.json({ transactions: enriched, transactionPayments }, {
      headers: { ETag: etag, "Cache-Control": "no-cache" },
    });
  },
  async POST(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const form = await ctx.req.formData();
    const description = form.get("description") as string;
    const amountRaw = form.get("amount") as string;
    const originalAmountRaw = form.get("originalAmount") as string;
    const type = (form.get("type") as string) || "unico";
    const splitJsonStr = form.get("splitJson") as string;
    const userPaid = form.get("userPaid") as string;
    const notes = (form.get("notes") as string) || "";
    const registryId = form.get("registryId") as string;
    const installmentCurrent = form.get("installmentCurrent")
      ? parseInt(form.get("installmentCurrent") as string)
      : null;
    const installmentTotal = form.get("installmentTotal")
      ? parseInt(form.get("installmentTotal") as string)
      : null;
    const relatedTransactionId = (form.get("relatedTransactionId") as string) ||
      null;

    let transactionPaymentEntries:
      | { expenseId: string; amount: number }[]
      | undefined;
    const tpRaw = form.get("transactionPayments") as string;
    if (tpRaw) {
      try {
        transactionPaymentEntries = JSON.parse(tpRaw);
      } catch {
        return Response.json(
          { error: "transactionPayments JSON inválido" },
          { status: 400 },
        );
      }
      if (!Array.isArray(transactionPaymentEntries)) {
        return Response.json(
          { error: "transactionPayments JSON inválido" },
          { status: 400 },
        );
      }
    }

    if (!description || !description.trim()) {
      return Response.json({ error: "Descripción requerida" }, { status: 400 });
    }
    if (!amountRaw || isNaN(parseFloat(amountRaw))) {
      return Response.json({ error: "Monto inválido" }, { status: 400 });
    }
    const amount = parseFloat(amountRaw);
    if (!isFinite(amount)) {
      return Response.json({ error: "Monto inválido" }, { status: 400 });
    }
    const originalAmount = originalAmountRaw
      ? parseFloat(originalAmountRaw)
      : amount;
    if (!isFinite(originalAmount)) {
      return Response.json({ error: "Monto original inválido" }, {
        status: 400,
      });
    }
    if (!userPaid) {
      return Response.json({ error: "Usuario pagador requerido" }, {
        status: 400,
      });
    }
    if (!registryId) {
      return Response.json({ error: "Registro requerido" }, { status: 400 });
    }

    let splitJson: TransactionSplit;
    try {
      splitJson = JSON.parse(splitJsonStr ?? "{}");
    } catch {
      return Response.json({ error: "Split JSON inválido" }, { status: 400 });
    }

    // Cross-reference validation (S7): the payer and every split recipient
    // must be participants (users or entities) of the TARGET registry, and
    // every referenced transaction must live in that same registry.
    const participantIds = registryId === ctx.state.activeRegistry?.id
      ? ctx.state.participants.map((p) => p.id)
      : [
        ...(await getUsers(registryId)).map((u) => u.id),
        ...(await getEntities(registryId, userId)).map((e) => e.id),
      ];
    if (!participantIds.includes(userPaid)) {
      return Response.json({ error: "Usuario pagador inválido" }, {
        status: 400,
      });
    }
    const splitUserIds = Array.isArray(splitJson?.splits)
      ? splitJson.splits.map((s) => s.userId)
      : [];
    if (splitUserIds.some((id) => !participantIds.includes(id))) {
      return Response.json({ error: "Participante inválido en el split" }, {
        status: 400,
      });
    }

    const refIds = [
      ...(relatedTransactionId ? [relatedTransactionId] : []),
      ...(transactionPaymentEntries ?? []).map((e) => e.expenseId),
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

    const tx = await createTransaction(
      {
        registry_id: registryId,
        description,
        amount,
        originalAmount,
        type: type as "unico" | "parcialidad" | "recurrente",
        exerciseId: null,
        installmentCurrent,
        installmentTotal,
        recurringDisabled: false,
        recurringGroupId: crypto.randomUUID(),
        notes,
        splitJson,
        creatorId: userId,
        userPaid,
        relatedTransactionId,
      },
      userId,
      transactionPaymentEntries,
    );

    if (!tx) {
      return new Response("Forbidden", { status: 403 });
    }

    invalidateRegistry(registryId);

    sendPushToRegistry(registryId, {
      title: "Nueva transacción",
      body: `${description} — $${
        originalAmount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      }`,
      registryId,
      url: "/dashboard",
    }, userId).catch((err) =>
      console.error("[push] sendPushToRegistry failed:", err)
    );

    return Response.json(tx);
  },
});
