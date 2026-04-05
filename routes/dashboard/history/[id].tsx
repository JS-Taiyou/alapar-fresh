import { define } from "../../../utils.ts";
import {
  getExerciseById,
  getTransactionsByExercise,
} from "../../../lib/store.ts";
import { Head } from "fresh/runtime";
import TransactionCard from "../../../components/TransactionCard.tsx";
import type { Transaction, User } from "../../../lib/types.ts";

interface EnrichedTransaction extends Transaction {
  paidByUser: User | null;
}

interface ExerciseDetailData {
  exercise: Awaited<ReturnType<typeof getExerciseById>>;
  transactions: EnrichedTransaction[];
}

export const handlers = define.handlers({
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

    const txs = await getTransactionsByExercise(id);
    const userMap = new Map(ctx.state.registryUsers.map((u) => [u.id, u]));
    const enriched = txs.map((tx) => ({
      ...tx,
      paidByUser: userMap.get(tx.userPaid) ?? null,
    }));

    return { data: { exercise, transactions: enriched } };
  },
});

export default define.page(function ExerciseDetail(ctx) {
  const data = ctx.data as ExerciseDetailData;
  const { exercise } = data;
  const currentUser = ctx.state.systemUser;
  const currentRegistryUserId = currentUser
    ? ctx.state.registryUsers.find((u) => u.system_user_id === currentUser.id)
      ?.id ?? ""
    : "";

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
          A la par - Corte {monthNames[exercise.startDate.getMonth()]}{" "}
          {exercise.startDate.getFullYear()}
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
                Corte {monthNames[exercise.startDate.getMonth()]}{" "}
                {exercise.startDate.getFullYear()}
              </h1>
              <p class="text-slate-400 text-sm">
                {exercise.transactionCount}{" "}
                gastos &bull; Total: ${exercise.totalAmount.toLocaleString(
                  "en-US",
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
              </p>
            </div>
          </header>

          <div class="space-y-4">
            {data.transactions.map((tx) => (
              <TransactionCard
                key={tx.id}
                transaction={tx}
                paidByUser={tx.paidByUser ?? null}
                currentUserId={currentRegistryUserId}
                allUsers={ctx.state.registryUsers}
              />
            ))}
          </div>
        </div>
      </main>
    </>
  );
});
