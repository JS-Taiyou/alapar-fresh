import { define } from "../../../utils.ts";
import { batchCloneTransactions, getTransactionById, isMemberOfRegistry } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await ctx.req.json();
    const items: { id: string; quantity?: number }[] = body.items ?? [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ created: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const first = await getTransactionById(items[0].id);
    if (!first) {
      return new Response("Not found", { status: 404 });
    }
    const member = await isMemberOfRegistry(userId, first.registry_id);
    if (!member) {
      return new Response("Forbidden", { status: 403 });
    }

    await batchCloneTransactions(
      items.map((item) => ({ id: item.id, quantity: item.quantity ?? 1 })),
    );

    return new Response(JSON.stringify({ created: items.length }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
