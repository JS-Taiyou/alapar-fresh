import { useSignal } from "@preact/signals";
import { define } from "../../utils.ts";
import {
  calculateBalance,
  calculatePairwiseBreakdown,
  getActiveTransactions,
  getSpawnCandidates,
  getTransactionPaymentsForRegistry,
} from "../../lib/store.ts";
import {
  getCachedSpawnCandidates,
  getCachedTransactions,
} from "../../lib/server-cache.ts";
import { getSupabaseAnonKey, getSupabaseUrl } from "../../lib/supabase.ts";
import { Head } from "fresh/runtime";
import TransactionList from "../../islands/TransactionList.tsx";
import CortarButton from "../../islands/CortarButton.tsx";
import RecurringSpawn from "../../islands/RecurringSpawn.tsx";
import BalanceBreakdown from "../../islands/BalanceBreakdown.tsx";
import type {
  BalanceBreakdownEntry,
  DefaultSplit,
  Participant,
  TransactionPayment,
} from "../../lib/types.ts";
import type { EnrichedTransaction } from "../../islands/shared-signals.ts";

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
  transactionPayments: TransactionPayment[];
  balance: number;
  currentUserId: string;
  spawnCandidates: SpawnCandidate[];
  balanceBreakdown: BalanceBreakdownEntry[];
  usersCount: number;
  accessToken: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  lastModified: string | null;
}

export const handler = define.handlers({
  async GET(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    const userId = ctx.state.user?.id;
    console.log(
      "[dashboard] handler start, registryId:",
      registryId,
      "userId:",
      userId,
    );
    if (!registryId || !userId) {
      console.log("[dashboard] early return (no registry/user)");
      return {
        data: {
          transactions: [] as EnrichedTransaction[],
          transactionPayments: [] as TransactionPayment[],
          balance: 0,
          currentUserId: "",
          spawnCandidates: [],
          balanceBreakdown: [],
          usersCount: ctx.state.participants.length,
          accessToken: "",
          supabaseUrl: getSupabaseUrl(),
          supabaseAnonKey: getSupabaseAnonKey(),
          lastModified: null,
        },
      };
    }

    console.log("[dashboard] getCachedTransactions start");
    const { transactions } = await getCachedTransactions(
      registryId,
      () => getActiveTransactions(registryId),
    );
    console.log(
      "[dashboard] getCachedTransactions done, count:",
      transactions.length,
    );

    console.log("[dashboard] getTransactionPaymentsForRegistry start");
    const transactionPayments = await getTransactionPaymentsForRegistry(
      registryId,
    );
    console.log(
      "[dashboard] getTransactionPaymentsForRegistry done, count:",
      transactionPayments.length,
    );

    console.log("[dashboard] calculateBalance start");
    const balance = await calculateBalance(
      userId,
      registryId,
      transactions,
    );
    console.log("[dashboard] calculateBalance done:", balance);

    console.log("[dashboard] getCachedSpawnCandidates start");
    const candidates = await getCachedSpawnCandidates(
      registryId,
      () => getSpawnCandidates(registryId),
    );
    console.log(
      "[dashboard] getCachedSpawnCandidates done, count:",
      candidates.length,
    );

    const participantMap = new Map(
      ctx.state.participants.map((p) => [p.id, p]),
    );
    const enriched = transactions.map((tx) => ({
      ...tx,
      paidByUser: participantMap.get(tx.userPaid) ?? null,
    }));

    const spawnCandidates: SpawnCandidate[] = candidates.map((c) => ({
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

    console.log("[dashboard] handler complete, returning data");
    return {
      data: {
        transactions: enriched,
        transactionPayments,
        balance,
        currentUserId: userId,
        spawnCandidates,
        balanceBreakdown,
        usersCount: ctx.state.participants.length,
        accessToken: getAccessToken(ctx.req.headers.get("cookie") ?? ""),
        supabaseUrl: getSupabaseUrl(),
        supabaseAnonKey: getSupabaseAnonKey(),
        lastModified: ctx.state.activeRegistry?.lastModified?.toISOString() ??
          null,
      },
    };
  },
});

function getAccessToken(cookieHeader: string): string {
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith("sb-access-token=")) {
      return cookie.substring("sb-access-token=".length);
    }
  }
  return "";
}

export default define.page(function DashboardIndex(ctx) {
  const data = ctx.data as DashboardData;
  const hasTransactions = data.transactions.length > 0;

  const $transactions = useSignal<EnrichedTransaction[]>(data.transactions);
  const $users = useSignal<Participant[]>(ctx.state.participants);
  const $currentUserId = useSignal(data.currentUserId);
  const $registryId = useSignal(ctx.state.activeRegistry?.id ?? "");
  const $balance = useSignal(data.balance);
  const $balanceEntries = useSignal<BalanceBreakdownEntry[]>(
    data.balanceBreakdown,
  );
  const $defaultSplit = useSignal<DefaultSplit | null>(
    ctx.state.activeRegistry?.defaultSplit ?? null,
  );
  const $spawnCandidates = useSignal(data.spawnCandidates);
  const $lastModified = useSignal<string | null>(data.lastModified);
  const $entities = useSignal<{ id: string; name: string; color: string }[]>(
    ctx.state.entities.map((e) => ({ id: e.id, name: e.name, color: e.color })),
  );
  const $entityIds = useSignal<Set<string>>(
    new Set(ctx.state.entities.map((e) => e.id)),
  );
  const $transactionPayments = useSignal<TransactionPayment[]>(
    data.transactionPayments,
  );

  const hasMultipleParticipants =
    $users.value.length + $entities.value.length > 1;

  return (
    <>
      <Head>
        <title>A la par - Dashboard</title>
      </Head>
      {hasMultipleParticipants && (
        <header class="p-4 sm:p-6 bg-[#0a0a0a] border-b border-white/10 flex justify-between items-center gap-2">
          <BalanceBreakdown
            balance={$balance}
            entries={$balanceEntries}
            users={$users}
          />
          <div class="flex items-center gap-2 sm:gap-4 shrink-0">
            <RecurringSpawn candidates={$spawnCandidates} />
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
            <CortarButton hasTransactions={hasTransactions} />
          </div>
        </header>
      )}
      <TransactionList
        transactions={$transactions}
        users={$users}
        currentUserId={$currentUserId}
        registryId={$registryId}
        balance={$balance}
        balanceEntries={$balanceEntries}
        defaultSplit={$defaultSplit}
        spawnCandidates={$spawnCandidates}
        lastModified={$lastModified}
        entityIds={$entityIds}
        entities={$entities}
        transactionPayments={$transactionPayments}
        supabaseUrl={data.supabaseUrl}
        supabaseAnonKey={data.supabaseAnonKey}
        accessToken={data.accessToken}
      />
    </>
  );
});
