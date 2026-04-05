import { define } from "../../../utils.ts";
import { batchCloneTransactions } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(_ctx) {
    const body = await _ctx.req.json();
    const items: { id: string; quantity?: number }[] = body.items ?? [];

    await batchCloneTransactions(
      items.map((item) => ({ id: item.id, quantity: item.quantity ?? 1 })),
    );

    return new Response(JSON.stringify({ created: items.length }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
