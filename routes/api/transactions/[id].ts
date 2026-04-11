import { define } from "../../../utils.ts";
import {
  deleteTransaction,
  getTransactionById,
  updateTransaction,
} from "../../../lib/store.ts";
import type { TransactionSplit } from "../../../lib/types.ts";

export const handlers = define.handlers({
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
    const amount = parseFloat(form.get("amount") as string);
    const originalAmount = parseFloat(form.get("originalAmount") as string);
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
    const splitJson: TransactionSplit = JSON.parse(splitJsonStr);

    const updated = await updateTransaction(id, {
      description,
      amount,
      originalAmount,
      type: type as "unico" | "parcialidad" | "recurrente",
      notes,
      splitJson,
      userPaid,
      installmentCurrent,
      installmentTotal,
    }, userId);
    if (!updated) {
      return new Response("Forbidden", { status: 403 });
    }
    return Response.json(updated);
  },
  async DELETE(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const id = ctx.params.id;
    const deleted = await deleteTransaction(id, userId);
    if (!deleted) {
      return new Response("Not found or forbidden", { status: 404 });
    }
    return new Response(null, { status: 204 });
  },
});
