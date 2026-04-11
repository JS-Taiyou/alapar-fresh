import { define } from "../../../utils.ts";
import { getTransactionById, updateTransaction } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await ctx.req.json();
    const id: string = body.id;
    if (!id) return new Response("Missing id", { status: 400 });

    const tx = await getTransactionById(id);
    if (!tx) return new Response("Not found", { status: 404 });

    const updated = await updateTransaction(id, { recurringDisabled: true }, userId);
    if (!updated) return new Response("Forbidden", { status: 403 });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
