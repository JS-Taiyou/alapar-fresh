import { signal } from "@preact/signals";
import type {
  BalanceBreakdownEntry,
  DefaultSplit,
  Transaction,
  User,
} from "../lib/types.ts";
import {
  calculateBalance,
  calculatePairwiseBreakdown,
  computeDefaultPercentages,
} from "../lib/calculations.ts";

export interface EnrichedTransaction extends Transaction {
  paidByUser: User | null;
}

export const transactionsSignal = signal<EnrichedTransaction[]>([]);
export const usersSignal = signal<User[]>([]);
export const currentUserIdSignal = signal("");
export const registryIdSignal = signal("");
export const balanceSignal = signal(0);
export const balanceEntriesSignal = signal<BalanceBreakdownEntry[]>([]);
export const defaultSplitSignal = signal<DefaultSplit | null>(null);

export function initializeSignals(data: {
  transactions: EnrichedTransaction[];
  users: User[];
  currentUserId: string;
  registryId: string;
  balance: number;
  balanceBreakdown: BalanceBreakdownEntry[];
  defaultSplit: DefaultSplit | null;
}) {
  transactionsSignal.value = data.transactions;
  usersSignal.value = data.users;
  currentUserIdSignal.value = data.currentUserId;
  registryIdSignal.value = data.registryId;
  balanceSignal.value = data.balance;
  balanceEntriesSignal.value = data.balanceBreakdown;
  defaultSplitSignal.value = data.defaultSplit;
}

export function recalculateAndBroadcast() {
  const txs = transactionsSignal.value;
  const userId = currentUserIdSignal.value;
  const users = usersSignal.value;
  balanceSignal.value = calculateBalance(txs, userId);
  balanceEntriesSignal.value = calculatePairwiseBreakdown(txs, userId, users);
}

export { computeDefaultPercentages };
