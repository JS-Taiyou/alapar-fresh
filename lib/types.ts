export interface User {
  id: string;
  registry_id: string;
  system_user_id: string;
  email: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  registry_id: string;
  description: string;
  amount: number;
  originalAmount: number;
  type: "unico" | "parcialidad" | "recurrente" | "pago";
  exerciseId: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  recurringDisabled: boolean;
  recurringGroupId: string;
  notes: string;
  splitJson: TransactionSplit;
  creatorId: string;
  userPaid: string;
  createdAt: Date;
}

export interface Exercise {
  id: string;
  registry_id: string;
  startDate: Date;
  endDate: Date;
  transactionCount: number;
  totalAmount: number;
}

export interface Registry {
  id: string;
  name: string;
  dbName: string;
  isDefault: boolean;
  latestAccessed: Date;
}

export interface SplitEntry {
  userId: string;
  percentage: number;
  amount: number;
}

export interface TransactionSplit {
  splits: SplitEntry[];
}

export interface SystemUser {
  id: string;
  email: string;
  name: string;
  supabaseAuthId: string | null;
}

export interface UserPreferences {
  id: string;
  userId: string;
  activeRegistryId: string | null;
  updatedAt: Date;
}

export interface RegistryMember {
  id: string;
  registryId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

export interface BalanceBreakdownEntry {
  userId: string;
  userName: string;
  userColor: string;
  amount: number;
}
