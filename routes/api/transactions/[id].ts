import { define } from "../../../utils.ts";
import {
  deleteTransaction,
  getTransactionById,
  updateTransaction,
} from "../../../lib/store.ts";
import { invalidateRegistry } from "../../../lib/server-cache.ts";
import { sendPushToRegistry } from "../../../lib/push.ts";
import type { TransactionSplit } from "../../../lib/types.ts";

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
    const description = form.get("description") as string;
    const amountRaw = form.get("amount") as string;
    const originalAmountRaw = form.get("originalAmount") as string;
    const type = (form.get("type") as string) || "unico";
    const splitJsonStr = form.get("splitJson") as string;
    const userPaid = form.get("userPaid") as string;
    const notes = (form.get("notes") as string) || "";
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

    let splitJson: TransactionSplit;
    try {
      splitJson = JSON.parse(splitJsonStr ?? "{}");
    } catch {
      return Response.json({ error: "Split JSON inválido" }, { status: 400 });
    }

    const updated = await updateTransaction(
      id,
      {
        description,
        amount,
        originalAmount,
        type: type as "unico" | "parcialidad" | "recurrente",
        notes,
        splitJson,
        userPaid,
        installmentCurrent,
        installmentTotal,
        relatedTransactionId,
      },
      userId,
      transactionPaymentEntries,
    );
    if (!updated) {
      return new Response("Forbidden", { status: 403 });
    }

    invalidateRegistry(tx.registry_id);

    sendPushToRegistry(tx.registry_id, {
      title: "Transacción actualizada",
      body: `${description} — $${
        originalAmount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      }`,
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
