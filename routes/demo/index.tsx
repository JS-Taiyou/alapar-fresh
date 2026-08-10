import { useSignal } from "@preact/signals";
import { define } from "../../utils.ts";
import {
  calculateBalance,
  calculatePairwiseBreakdown,
} from "../../lib/calculations.ts";
import { Head } from "fresh/runtime";
import TransactionList from "../../islands/TransactionList.tsx";
import BalanceBreakdown from "../../islands/BalanceBreakdown.tsx";
import DemoTour from "../../islands/DemoTour.tsx";
import type {
  BalanceBreakdownEntry,
  DefaultSplit,
  Participant,
  TransactionPayment,
} from "../../lib/types.ts";
import type { EnrichedTransaction } from "../../islands/shared-signals.ts";
import demoData from "../../data/demo.json" with { type: "json" };

const DEMO_REGISTRY_ID = demoData.registry.id;
const DEMO_USER_ID = demoData.users[0].id;

interface DemoData {
  transactions: EnrichedTransaction[];
  transactionPayments: TransactionPayment[];
  balance: number;
  currentUserId: string;
  balanceBreakdown: BalanceBreakdownEntry[];
  users: Participant[];
  entities: { id: string; name: string; color: string }[];
}

export const handler = define.handlers({
  GET() {
    const users: Participant[] = demoData.users.map((u) => ({
      id: u.id,
      name: u.name,
      color: u.color,
    }));

    const participantMap = new Map(users.map((u) => [u.id, u]));

    const transactions: EnrichedTransaction[] = demoData.transactions.map((
      t,
    ) => ({
      id: t.id,
      registry_id: t.registry_id,
      description: t.description,
      amount: t.amount,
      originalAmount: t.originalAmount,
      type: t.type as
        | "unico"
        | "parcialidad"
        | "recurrente"
        | "pago"
        | "ajuste",
      exerciseId: t.exerciseId,
      installmentCurrent: t.installmentCurrent,
      installmentTotal: t.installmentTotal,
      recurringDisabled: t.recurringDisabled,
      recurringGroupId: t.recurringGroupId,
      notes: t.notes,
      splitJson: t.splitJson,
      relatedTransactionId: t.relatedTransactionId,
      creatorId: t.creatorId,
      userPaid: t.userPaid,
      createdAt: new Date(t.createdAt),
      paidByUser: participantMap.get(t.userPaid) ?? null,
    }));

    const transactionPayments: TransactionPayment[] = demoData
      .transactionPayments.map((tp) => ({
        id: tp.id,
        pagoId: tp.pagoId,
        expenseId: tp.expenseId,
        amount: tp.amount,
        createdAt: new Date(tp.createdAt),
      }));

    const balance = calculateBalance(transactions, DEMO_USER_ID);
    const balanceBreakdown = calculatePairwiseBreakdown(
      transactions,
      DEMO_USER_ID,
      users,
    );

    return {
      data: {
        transactions,
        transactionPayments,
        balance,
        currentUserId: DEMO_USER_ID,
        balanceBreakdown,
        users,
        entities: [] as { id: string; name: string; color: string }[],
      },
    };
  },
});

export default define.page(function DemoPage(ctx) {
  const data = ctx.data as DemoData;
  const $transactions = useSignal<EnrichedTransaction[]>(data.transactions);
  const $users = useSignal<Participant[]>(data.users);
  const $currentUserId = useSignal(data.currentUserId);
  const $registryId = useSignal(DEMO_REGISTRY_ID);
  const $balance = useSignal(data.balance);
  const $balanceEntries = useSignal<BalanceBreakdownEntry[]>(
    data.balanceBreakdown,
  );
  const $defaultSplit = useSignal<DefaultSplit | null>(null);
  const $spawnCandidates = useSignal([]);
  const $lastModified = useSignal<string | null>(null);
  const $entityIds = useSignal<Set<string>>(new Set());
  const $entities = useSignal<{ id: string; name: string; color: string }[]>(
    data.entities,
  );
  const $transactionPayments = useSignal<TransactionPayment[]>(
    data.transactionPayments,
  );

  const hasMultipleParticipants = $users.value.length > 1;

  return (
    <>
      <Head>
        <title>Demo - A la par</title>
      </Head>
      {hasMultipleParticipants && (
        <header class="p-4 sm:p-6 bg-[#0a0a0a] border-b border-white/10 flex justify-between items-center gap-2">
          <BalanceBreakdown
            balance={$balance}
            entries={$balanceEntries}
            users={$users}
          />
          <div class="flex items-center gap-2 sm:gap-4 shrink-0">
            <a
              href="/"
              class="p-3 bg-card hover:bg-white/5 transition-colors rounded-custom text-gray-300"
              title="Inicio"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </a>
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
        isDemo
      />
      <DemoTour />
    </>
  );
});
