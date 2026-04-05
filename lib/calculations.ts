import type {
  BalanceBreakdownEntry,
  DefaultSplit,
  SplitEntry,
  Transaction,
  TransactionSplit,
  User,
} from "./types.ts";

export function calculateBalance(
  transactions: Transaction[],
  userId: string,
): number {
  let balance = 0;
  for (const tx of transactions) {
    if (tx.type === "pago") {
      if (tx.userPaid === userId) {
        balance += tx.originalAmount;
      } else {
        const isInSplit = tx.splitJson.splits.some((s) => s.userId === userId);
        if (isInSplit) balance -= tx.originalAmount;
      }
      continue;
    }
    const userSplit = tx.splitJson.splits.find((s) => s.userId === userId);
    if (!userSplit) continue;
    const divisor = tx.type === "parcialidad" && tx.installmentTotal
      ? tx.installmentTotal
      : 1;
    const totalAmount = tx.originalAmount / divisor;
    const splitAmount = userSplit.amount / divisor;
    if (tx.userPaid === userId) {
      balance += totalAmount - splitAmount;
    } else {
      balance -= splitAmount;
    }
  }
  return balance;
}

export function calculatePairwiseBreakdown(
  transactions: Transaction[],
  currentUserId: string,
  allUsers: User[],
): BalanceBreakdownEntry[] {
  const net: Record<string, number> = {};
  for (const u of allUsers) {
    if (u.id !== currentUserId) net[u.id] = 0;
  }

  for (const tx of transactions) {
    if (tx.type === "pago") {
      if (tx.userPaid === currentUserId) {
        const recipient = tx.splitJson.splits[0];
        if (recipient && net[recipient.userId] !== undefined) {
          net[recipient.userId] += tx.originalAmount;
        }
      } else if (
        tx.splitJson.splits.some((s) => s.userId === currentUserId)
      ) {
        if (net[tx.userPaid] !== undefined) {
          net[tx.userPaid] -= tx.originalAmount;
        }
      }
      continue;
    }

    const divisor = tx.type === "parcialidad" && tx.installmentTotal
      ? tx.installmentTotal
      : 1;
    const currentUserSplit = tx.splitJson.splits.find((s) =>
      s.userId === currentUserId
    );
    if (!currentUserSplit) continue;

    if (tx.userPaid === currentUserId) {
      for (const split of tx.splitJson.splits) {
        if (split.userId !== currentUserId && net[split.userId] !== undefined) {
          net[split.userId] += split.amount / divisor;
        }
      }
    } else {
      if (net[tx.userPaid] !== undefined) {
        net[tx.userPaid] -= currentUserSplit.amount / divisor;
      }
    }
  }

  const entries: BalanceBreakdownEntry[] = [];
  for (const u of allUsers) {
    if (u.id === currentUserId) continue;
    const amount = Math.round((net[u.id] ?? 0) * 100) / 100;
    if (Math.abs(amount) >= 0.01) {
      entries.push({
        userId: u.id,
        userName: u.name,
        userColor: u.color,
        amount,
      });
    }
  }

  entries.sort((a, b) => b.amount - a.amount);
  return entries;
}

export function computeDefaultPercentages(
  users: User[],
  defaultSplit: DefaultSplit | null,
): Record<string, number> {
  if (defaultSplit && defaultSplit.splits.length === users.length) {
    const userIds = new Set(users.map((u) => u.id));
    const allPresent = defaultSplit.splits.every((s) => userIds.has(s.userId));
    if (allPresent) {
      return Object.fromEntries(
        defaultSplit.splits.map((s) => [s.userId, s.percentage]),
      );
    }
  }
  return Object.fromEntries(
    users.map((u) => [u.id, Math.round(10000 / users.length) / 100]),
  );
}

export function buildEqualSplit(
  total: number,
  userIds: string[],
): TransactionSplit {
  const count = userIds.length;
  const perPerson = Math.floor((total / count) * 100) / 100;
  const remainder = Math.round((total - perPerson * count) * 100) / 100;
  const splits: SplitEntry[] = userIds.map((uid, i) => ({
    userId: uid,
    percentage: Math.round((100 / count) * 100) / 100,
    amount: perPerson + (i === 0 ? remainder : 0),
  }));
  return { splits };
}

export function buildPercentageSplit(
  total: number,
  percentages: { userId: string; percentage: number }[],
): TransactionSplit {
  const splits: SplitEntry[] = percentages.map((p) => ({
    userId: p.userId,
    percentage: p.percentage,
    amount: Math.round(total * p.percentage) / 100,
  }));
  return { splits };
}

export function buildFixedSplit(
  total: number,
  amounts: { userId: string; amount: number }[],
): TransactionSplit {
  const splits: SplitEntry[] = amounts.map((a) => ({
    userId: a.userId,
    percentage: total > 0 ? Math.round((a.amount / total) * 10000) / 100 : 0,
    amount: a.amount,
  }));
  return { splits };
}
