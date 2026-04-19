import type {
  Participant,
  Transaction,
  TransactionPayment,
} from "../lib/types.ts";

export interface EnrichedTransaction extends Transaction {
  paidByUser: Participant | null;
  transactionPayments?: TransactionPayment[];
}
