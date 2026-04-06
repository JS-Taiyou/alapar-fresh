import type { Exercise } from "../lib/types.ts";

interface ExerciseCardProps {
  exercise: Exercise;
  monthName: string;
  personalTotal?: number;
}

export default function ExerciseCard(props: ExerciseCardProps) {
  const { exercise, monthName, personalTotal } = props;

  const totalDisplay = personalTotal !== undefined
    ? `${personalTotal >= 0 ? "+" : "-"}$${Math.abs(personalTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${exercise.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <a
      href={`/dashboard/history/${exercise.id}`}
      class="w-full flex items-center justify-between p-4 bg-[#1e293b] border border-slate-700 rounded-custom hover:bg-slate-700/50 hover:translate-x-1 transition-all group text-left"
    >
      <div class="flex items-center gap-4">
        <div class="h-10 w-10 bg-slate-700 rounded-custom flex items-center justify-center text-slate-300 font-bold text-xs">
          {monthName}
        </div>
        <div>
          <p class="font-medium text-slate-100 leading-tight">
            Corte {exercise.startDate.toLocaleDateString("es-MX", {
              month: "long",
              year: "numeric",
            })}
          </p>
          <p class="text-xs text-slate-500">
            {exercise.transactionCount}{" "}
            Gastos &bull; Total: {totalDisplay}
          </p>
        </div>
      </div>
      <svg
        class="h-5 w-5 text-slate-600 group-hover:text-primary-light"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M9 5l7 7-7 7"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </svg>
    </a>
  );
}
