import { define } from "../../../utils.ts";
import { cloneTransactionForNextPeriod, getTransactionById } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const items: { id: string; quantity?: number }[] = body.items ?? [];

    for (const item of items) {
      const source = await getTransactionById(item.id);
      if (!source) continue;
      const quantity = source.type === "parcialidad" ? (item.quantity ?? 1) : 1;
      for (let i = 1; i <= quantity; i++) {
        await cloneTransactionForNextPeriod(item.id, i);
      }
    }

    return new Response(JSON.stringify({ created: items.length }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
