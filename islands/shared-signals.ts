import type { Transaction, User } from "../lib/types.ts";

export interface EnrichedTransaction extends Transaction {
  paidByUser: User | null;
}
