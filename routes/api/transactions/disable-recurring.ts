import { define } from "../../../utils.ts";
import { getTransactionById, updateTransaction } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const id: string = body.id;
    if (!id) return new Response("Missing id", { status: 400 });

    const tx = await getTransactionById(id);
    if (!tx) return new Response("Not found", { status: 404 });

    await updateTransaction(id, { recurringDisabled: true });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
