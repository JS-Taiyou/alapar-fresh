import { define } from "../../utils.ts";
import {
  calculateBalance,
  calculatePairwiseBreakdown,
  getActiveTransactions,
  getSpawnCandidates,
} from "../../lib/store.ts";
import {
  getCachedSpawnCandidates,
  getCachedTransactions,
} from "../../lib/server-cache.ts";
import { generateETag } from "../../lib/etag.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    const userId = ctx.state.user?.id;
    if (!registryId || !userId) {
      return Response.json(
        {
          transactions: [],
          users: [],
          balance: 0,
          balanceEntries: [],
          spawnCandidates: [],
          defaultSplit: null,
          entityIds: [],
        },
        { status: 200 },
      );
    }

    const { transactions } = await getCachedTransactions(
      registryId,
      () => getActiveTransactions(registryId),
    );
    const balance = await calculateBalance(userId, registryId, transactions);
    const candidates = await getCachedSpawnCandidates(
      registryId,
      () => getSpawnCandidates(registryId),
    );

    const participantMap = new Map(
      ctx.state.participants.map((p) => [p.id, p]),
    );
    const enriched = transactions.map((tx) => ({
      ...tx,
      paidByUser: participantMap.get(tx.userPaid) ?? null,
    }));

    const spawnCandidates = candidates.map((c) => ({
      id: c.id,
      description: c.description,
      type: c.type as "parcialidad" | "recurrente",
      originalAmount: c.originalAmount,
      installmentCurrent: c.installmentCurrent,
      installmentTotal: c.installmentTotal,
    }));

    const balanceBreakdown = calculatePairwiseBreakdown(
      transactions,
      userId,
      ctx.state.participants,
    );

    const entityIds = ctx.state.entities.map((e) => e.id);

    const data = {
      transactions: enriched,
      users: ctx.state.participants,
      balance,
      balanceEntries: balanceBreakdown,
      spawnCandidates,
      defaultSplit: ctx.state.activeRegistry?.defaultSplit ?? null,
      entityIds,
    };

    const etag = generateETag(data);

    const ifNoneMatch = ctx.req.headers.get("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    return Response.json(data, {
      headers: { ETag: etag, "Cache-Control": "no-cache" },
    });
  },
});
