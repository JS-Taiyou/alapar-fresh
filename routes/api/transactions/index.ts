import { define } from "../../../utils.ts";
import { createTransaction } from "../../../lib/store.ts";
import type { TransactionSplit } from "../../../lib/types.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const form = await ctx.req.formData();
    const description = form.get("description") as string;
    const amount = parseFloat(form.get("amount") as string);
    const originalAmount = parseFloat(form.get("originalAmount") as string);
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

    const splitJson: TransactionSplit = JSON.parse(splitJsonStr);

    const tx = await createTransaction({
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
      creatorId: userPaid,
      userPaid,
      relatedTransactionId,
    }, userId);

    if (!tx) {
      return new Response("Forbidden", { status: 403 });
    }

    return Response.json(tx);
  },
});
