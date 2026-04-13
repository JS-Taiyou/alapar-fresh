import { define } from "../../../utils.ts";
import { createTransaction, getActiveTransactions } from "../../../lib/store.ts";
import type { TransactionSplit } from "../../../lib/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) {
      return Response.json({ transactions: [] });
    }

    const transactions = await getActiveTransactions(registryId);
    const participantMap = new Map(
      ctx.state.participants.map((p) => [p.id, p]),
    );
    const enriched = transactions.map((tx) => ({
      ...tx,
      paidByUser: participantMap.get(tx.userPaid) ?? null,
    }));

    const etag = generateETag(enriched);
    const ifNoneMatch = ctx.req.headers.get("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    return Response.json({ transactions: enriched }, {
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

function generateETag(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `"${Math.abs(hash).toString(36)}"`;
}
