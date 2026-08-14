import { define } from "../../utils.ts";
import { Head } from "fresh/runtime";
import {
  getExercises,
  getMonthNameEs,
  getTransactionsByExercise,
} from "../../lib/store.ts";
import { getRegistryPlan } from "../../lib/entitlements.ts";
import ExerciseCard from "../../components/ExerciseCard.tsx";
import PaywallCard from "../../components/PaywallCard.tsx";
import SearchBar from "../../islands/SearchBar.tsx";

interface HistoryData {
  grouped: Record<number, Awaited<ReturnType<typeof getExercises>>>;
  years: number[];
  exercises: Awaited<ReturnType<typeof getExercises>>;
  personalTotals: Map<string, number>;
  /** Null when the registry has full history (pro/grandfathered). */
  lockedCount: number | null;
}

export const handler = define.handlers({
  async GET(ctx) {
    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) {
      return {
        data: {
          grouped: {} as Record<
            number,
            Awaited<ReturnType<typeof getExercises>>
          >,
          years: [] as number[],
          exercises: [] as Awaited<ReturnType<typeof getExercises>>,
          personalTotals: new Map<string, number>(),
        },
      };
    }

    const exercises = await getExercises(registryId);
    const currentUserId = ctx.state.user ? ctx.state.user.id : "";

    // Free plan: only the newest closed exercise is visible; older ones
    // render as locked placeholder rows (the paywall IS the discovery).
    const planInfo = await getRegistryPlan(registryId);
    let lockedCount: number | null = null;
    if (
      planInfo && !planInfo.isPro && exercises.length >
        planInfo.limits.maxClosedExercisesVisible
    ) {
      lockedCount = exercises.length -
        planInfo.limits.maxClosedExercisesVisible;
    }

    const personalTotals = new Map<string, number>();
    await Promise.all(exercises.map(async (ex) => {
      const txs = await getTransactionsByExercise(ex.id);
      const total = txs.reduce((sum, tx) => {
        if (tx.type === "pago" || tx.type === "ajuste") {
          if (tx.userPaid === currentUserId) {
            return sum + tx.originalAmount;
          }
          const isInSplit = tx.splitJson.splits.some((s) =>
            s.userId === currentUserId
          );
          if (isInSplit) return sum - tx.originalAmount;
          return sum;
        }
        const isPaidByMe = tx.userPaid === currentUserId;
        const userSplit = tx.splitJson.splits.find((s) =>
          s.userId === currentUserId
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
      personalTotals.set(ex.id, total);
    }));

    // Group only the visible (newest) exercises; locked ones render as a
    // single locked-rows block, not as hidden history.
    const visible = lockedCount === null
      ? exercises
      : exercises.slice(0, planInfo!.limits.maxClosedExercisesVisible);
    const grouped: Record<number, typeof exercises> = {};
    for (const ex of visible) {
      const year = ex.endDate.getFullYear();
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(ex);
    }
    const years = Object.keys(grouped).map(Number).sort((a, b) => b - a);

    return { data: { grouped, years, exercises, personalTotals, lockedCount } };
  },
});

export default define.page(function HistoryPage(ctx) {
  const data = ctx.data as HistoryData;
  const locale = ctx.state.locale;

  return (
    <>
      <Head>
        <title>A la par - Histórico de Cortes</title>
      </Head>
      <main class="flex-1 overflow-y-auto custom-scrollbar">
        <div class="max-w-2xl mx-auto px-4 py-8">
          <header class="mb-8 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a
                class="p-2 hover:bg-white/5 rounded-custom text-zinc-400 hover:text-white transition-colors"
                href="/dashboard"
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
                  Histórico de Cortes
                </h1>
                <p class="text-zinc-400 text-sm">
                  Consulta cierres de meses anteriores
                </p>
              </div>
            </div>
            <div class="bg-primary/20 p-3 rounded-custom">
              <svg
                class="h-6 w-6 text-primary-light"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
          </header>

          <SearchBar
            placeholder="Buscar corte por mes o año..."
            filterSelector="[data-exercise-card]"
          />

          <section class="space-y-4 mt-6">
            {data.lockedCount !== null && data.lockedCount > 0 && (
              <PaywallCard locale={locale} lockedCount={data.lockedCount} />
            )}
            {data.years.map((year) => (
              <div key={year} class="space-y-2">
                <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-widest px-2 py-1">
                  {year}
                </h2>
                {data.grouped[year].map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    monthName={getMonthNameEs(ex.endDate).toUpperCase()
                      .substring(0, 3)}
                    personalTotal={data.personalTotals.get(ex.id)}
                  />
                ))}
              </div>
            ))}
          </section>

          {data.exercises.length === 0 && (
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <div class="bg-white/5 p-4 rounded-full mb-4">
                <svg
                  class="h-12 w-12 text-zinc-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
              </div>
              <h3 class="text-lg font-medium text-zinc-300">
                No hay cortes registrados
              </h3>
              <p class="text-zinc-400 mt-2 max-w-xs mx-auto">
                Cuando realices un cierre de gastos aparecerán aquí.
              </p>
            </div>
          )}

          <footer class="mt-12 text-center border-t border-white/10 pt-6">
            <p class="text-zinc-500 text-xs italic">
              * Los cortes incluyen liquidaciones definitivas y facturas
              archivadas.
            </p>
          </footer>
        </div>
      </main>
    </>
  );
});
