import { define } from "../../utils.ts";
import {
  calculateBalance,
  calculatePairwiseBreakdown,
  getActiveTransactions,
  getEntities,
  getSpawnCandidates,
  getTransactionPaymentsForRegistry,
  getUsers,
} from "../../lib/store.ts";
import {
  getCachedSpawnCandidates,
  getCachedTransactions,
} from "../../lib/server-cache.ts";
import { generateETag } from "../../lib/etag.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json(
        {
          transactions: [],
          transactionPayments: [],
          users: [],
          balance: 0,
          balanceEntries: [],
          spawnCandidates: [],
          defaultSplit: null,
          entityIds: [],
          entities: [],
          currentUserId: null,
          lastModified: null,
        },
        { status: 200 },
      );
    }

    const url = new URL(ctx.req.url);
    const requestedId = url.searchParams.get("registryId");
    const registryId = requestedId && ctx.state.registries.some((r) =>
        r.id === requestedId
      )
      ? requestedId
      : ctx.state.activeRegistry?.id;

    if (!registryId) {
      return Response.json(
        {
          transactions: [],
          transactionPayments: [],
          users: [],
          balance: 0,
          balanceEntries: [],
          spawnCandidates: [],
          defaultSplit: null,
          entityIds: [],
          entities: [],
          currentUserId: null,
          lastModified: null,
        },
        { status: 200 },
      );
    }

    const isActiveRegistry = registryId === ctx.state.activeRegistry?.id;

    const { transactions } = await getCachedTransactions(
      registryId,
      () => getActiveTransactions(registryId),
    );
    const transactionPayments = await getTransactionPaymentsForRegistry(
      registryId,
    );
    const balance = await calculateBalance(userId, registryId, transactions);
    const candidates = await getCachedSpawnCandidates(
      registryId,
      () => getSpawnCandidates(registryId),
    );

    let participants: { id: string; name: string; color: string }[];
    let entities: { id: string; name: string; color: string }[];
    let defaultSplit: unknown;

    if (isActiveRegistry) {
      participants = ctx.state.participants;
      entities = ctx.state.entities;
      defaultSplit = ctx.state.activeRegistry?.defaultSplit ?? null;
    } else {
      const [users, ents] = await Promise.all([
        getUsers(registryId),
        getEntities(registryId),
      ]);
      participants = [
        ...users.map((u) => ({ id: u.id, name: u.name, color: u.color })),
        ...ents.map((e) => ({ id: e.id, name: e.name, color: e.color })),
      ];
      entities = ents;
      const reg = ctx.state.registries.find((r) => r.id === registryId);
      defaultSplit = reg?.defaultSplit ?? null;
    }

    const participantMap = new Map(participants.map((p) => [p.id, p]));
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
      participants,
    );

    const entityIds = entities.map((e) => e.id);

    const data = {
      transactions: enriched,
      transactionPayments,
      users: participants,
      balance,
      balanceEntries: balanceBreakdown,
      spawnCandidates,
      defaultSplit,
      entityIds,
      entities: isActiveRegistry
        ? ctx.state.entities
        : entities.map((e) => ({ id: e.id, name: e.name, color: e.color })),
      currentUserId: userId,
      lastModified: ctx.state.registries.find((r) => r.id === registryId)
        ?.lastModified?.toISOString() ?? null,
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
