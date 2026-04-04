import { define } from "../../../utils.ts";
import { createTransaction } from "../../../lib/store.ts";
import type { TransactionSplit } from "../../../lib/types.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const description = form.get("description") as string;
    const amount = parseFloat(form.get("amount") as string);
    const originalAmount = parseFloat(form.get("originalAmount") as string);
    const type = (form.get("type") as string) || "unico";
    const splitJsonStr = form.get("splitJson") as string;
    const userPaid = form.get("userPaid") as string;
    const notes = (form.get("notes") as string) || "";
    const registryId = form.get("registryId") as string;
    const installmentCurrent = form.get("installmentCurrent") ? parseInt(form.get("installmentCurrent") as string) : null;
    const installmentTotal = form.get("installmentTotal") ? parseInt(form.get("installmentTotal") as string) : null;

    const splitJson: TransactionSplit = JSON.parse(splitJsonStr);

    await createTransaction({
      registry_id: registryId,
      description,
      amount,
      originalAmount,
      type: type as "unico" | "parcialidad" | "recurrente",
      exerciseId: null,
      installmentCurrent,
      installmentTotal,
      notes,
      splitJson,
      creatorId: userPaid,
      userPaid,
    });

    return ctx.redirect("/dashboard");
  },
});
