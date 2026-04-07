import type { Participant, Transaction } from "../lib/types.ts";

export interface EnrichedTransaction extends Transaction {
  paidByUser: Participant | null;
}
