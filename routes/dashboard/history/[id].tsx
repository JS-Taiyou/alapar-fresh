import { define } from "../../../utils.ts";
import {
  getExerciseById,
  getTransactionsByExercise,
} from "../../../lib/store.ts";
import { Head } from "fresh/runtime";
import TransactionCard from "../../../components/TransactionCard.tsx";
import type { Participant, Transaction } from "../../../lib/types.ts";

interface EnrichedTransaction extends Transaction {
  paidByUser: Participant | null;
}

interface ExerciseDetailData {
  exercise: Awaited<ReturnType<typeof getExerciseById>>;
  transactions: EnrichedTransaction[];
}

export const handler = define.handlers({
  async GET(ctx) {
    const id = ctx.params.id;
    const exercise = await getExerciseById(id);
    if (!exercise) {
      return {
        data: {
          exercise: undefined,
          transactions: [] as EnrichedTransaction[],
        },
      };
    }

    // IDOR guard: the exercise must belong to one of the caller's own
    // registries — otherwise indistinguishable from "does not exist".
    if (!ctx.state.registries.some((r) => r.id === exercise.registry_id)) {
      return new Response("Not found", { status: 404 });
    }

    const txs = await getTransactionsByExercise(id);
    const participantMap = new Map(
      ctx.state.participants.map((p) => [p.id, p]),
    );
    const enriched = txs.map((tx) => ({
      ...tx,
      paidByUser: participantMap.get(tx.userPaid) ?? null,
    }));

    return { data: { exercise, transactions: enriched } };
  },
});

export default define.page(function ExerciseDetail(ctx) {
  const data = ctx.data as ExerciseDetailData;
  const { exercise } = data;
  const currentUser = ctx.state.user;
  const currentRegistryUserId = currentUser ? currentUser.id : "";

  if (!exercise) {
    return (
      <>
        <Head>
          <title>A la par - No encontrado</title>
        </Head>
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <h1 class="text-2xl font-bold text-white mb-2">
              Corte no encontrado
            </h1>
            <a href="/dashboard/history" class="text-primary hover:underline">
              Volver al histórico
            </a>
          </div>
        </div>
      </>
    );
  }

  const personalTotal = data.transactions.reduce((sum, tx) => {
    if (tx.type === "pago" || tx.type === "ajuste") {
      if (tx.userPaid === currentRegistryUserId) {
        return sum + tx.originalAmount;
      }
      const isInSplit = tx.splitJson.splits.some((s) =>
        s.userId === currentRegistryUserId
      );
      if (isInSplit) return sum - tx.originalAmount;
      return sum;
    }
    const isPaidByMe = tx.userPaid === currentRegistryUserId;
    const userSplit = tx.splitJson.splits.find((s) =>
      s.userId === currentRegistryUserId
    );
    const divisor = tx.type === "parcialidad" && tx.installmentTotal
      ? tx.installmentTotal
      : 1;
    const perInstallmentTotal = tx.originalAmount / divisor;
    const perInstallmentSplit = (userSplit?.amount ?? 0) / divisor;
    const personalBalance = isPaidByMe
      ? perInstallmentTotal - perInstallmentSplit
      : -perInstallmentSplit;
    return sum + personalBalance;
  }, 0);

  const monthNames = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  return (
    <>
      <Head>
        <title>
          A la par - Corte {monthNames[exercise.endDate.getMonth()]}{" "}
          {exercise.endDate.getFullYear()}
        </title>
      </Head>
      <main class="flex-1 overflow-y-auto custom-scrollbar">
        <div class="max-w-2xl mx-auto px-4 py-8">
          <header class="mb-8 flex items-center gap-4">
            <a
              class="p-2 hover:bg-slate-800 rounded-custom text-slate-400 hover:text-white transition-colors"
              href="/dashboard/history"
            >
              <svg
                class="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </a>
            <div>
              <h1 class="text-2xl font-bold tracking-tight">
                Corte {monthNames[exercise.endDate.getMonth()]}{" "}
                {exercise.endDate.getFullYear()}
              </h1>
              <p class="text-slate-400 text-sm">
                {exercise.transactionCount} movimientos &bull; Total:{" "}
                {personalTotal >= 0 ? "+" : "-"}${Math.abs(personalTotal)
                  .toLocaleString(
                    "en-US",
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  )}
              </p>
            </div>
          </header>

          <div class="space-y-4">
            {data.transactions.map((tx) => {
              const relatedDesc = tx.relatedTransactionId
                ? data.transactions.find((t) =>
                  t.id === tx.relatedTransactionId
                )?.description
                : undefined;
              return (
                <TransactionCard
                  key={tx.id}
                  transaction={tx}
                  paidByUser={tx.paidByUser ?? null}
                  currentUserId={currentRegistryUserId}
                  allUsers={ctx.state.participants}
                  relatedDescription={relatedDesc}
                />
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
});
