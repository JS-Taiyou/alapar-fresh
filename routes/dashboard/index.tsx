import { define } from "../../utils.ts";
import {
  calculateBalance,
  getActiveTransactions,
  getSpawnCandidates,
  getUserById,
} from "../../lib/store.ts";
import { Head } from "fresh/runtime";
import TransactionList from "../../islands/TransactionList.tsx";
import CortarButton from "../../islands/CortarButton.tsx";
import RecurringSpawn from "../../islands/RecurringSpawn.tsx";
import type { Transaction, User } from "../../lib/types.ts";

interface EnrichedTransaction extends Transaction {
  paidByUser: User | null;
}

interface SpawnCandidate {
  id: string;
  description: string;
  type: "parcialidad" | "recurrente";
  originalAmount: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

interface DashboardData {
  transactions: EnrichedTransaction[];
  balance: number;
  currentRegistryUserId: string;
  spawnCandidates: SpawnCandidate[];
}

export const handlers = define.handlers({
  async GET(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    const systemUserId = ctx.state.systemUser?.id;
    if (!registryId || !systemUserId) {
      return {
        data: {
          transactions: [] as EnrichedTransaction[],
          balance: 0,
          currentRegistryUserId: "",
          spawnCandidates: [],
        },
      };
    }

    const registryUserId = ctx.state.registryUsers.find((u) =>
      u.system_user_id === systemUserId
    )?.id;
    if (!registryUserId) {
      return {
        data: {
          transactions: [] as EnrichedTransaction[],
          balance: 0,
          currentRegistryUserId: "",
          spawnCandidates: [],
        },
      };
    }

    const transactions = await getActiveTransactions(registryId);
    const balance = await calculateBalance(registryUserId, registryId);
    const candidates = await getSpawnCandidates(registryId);

    const enriched: EnrichedTransaction[] = [];
    for (const tx of transactions) {
      const paidByUser = await getUserById(tx.userPaid);
      enriched.push({ ...tx, paidByUser: paidByUser ?? null });
    }

    const spawnCandidates: SpawnCandidate[] = candidates.map((c) => ({
      id: c.id,
      description: c.description,
      type: c.type as "parcialidad" | "recurrente",
      originalAmount: c.originalAmount,
      installmentCurrent: c.installmentCurrent,
      installmentTotal: c.installmentTotal,
    }));

    return {
      data: {
        transactions: enriched,
        balance,
        currentRegistryUserId: registryUserId,
        spawnCandidates,
      },
    };
  },
});

export default define.page(function DashboardIndex(ctx) {
  const data = ctx.data as DashboardData;
  const balance = data.balance;
  const users = ctx.state.registryUsers;
  const currentRegistryUserId = data.currentRegistryUserId;
  const hasTransactions = data.transactions.length > 0;

  return (
    <>
      <Head>
        <title>A la par - Dashboard</title>
      </Head>
      <header class="p-6 bg-[#0a0a0a] border-b border-white/10 flex justify-between items-center">
        <div>
          <h1 class="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Balance Total
          </h1>
          <p
            class={`text-4xl font-bold mt-1 ${
              balance >= 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            ${Math.abs(balance).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
        <div class="flex items-center gap-4">
          <RecurringSpawn candidates={data.spawnCandidates} />
          <a
            href="/dashboard/history"
            class="p-3 bg-card hover:bg-white/5 transition-colors rounded-custom text-gray-300"
            title="Histórico"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </a>
          <CortarButton balance={balance} hasTransactions={hasTransactions} />
        </div>
      </header>
      <TransactionList
        transactions={data.transactions}
        users={users}
        currentUserId={currentRegistryUserId}
        registryId={ctx.state.activeRegistry?.id ?? ""}
      />
    </>
  );
});
