import type { Participant, Transaction } from "../lib/types.ts";

interface TransactionCardProps {
  transaction: Transaction;
  paidByUser: Participant | null;
  currentUserId: string;
  allUsers?: Participant[];
  relatedDescription?: string;
}

export default function TransactionCard(props: TransactionCardProps) {
  const { transaction: tx, paidByUser, currentUserId, allUsers, relatedDescription } = props;

  if (tx.type === "pago" || tx.type === "ajuste") {
    const isPayer = tx.userPaid === currentUserId;
    const recipientSplit = tx.splitJson.splits[0];
    const recipientUser = recipientSplit && allUsers
      ? allUsers.find((u) => u.id === recipientSplit.userId)
      : null;
    const payerUser = paidByUser;
    const formattedAmount = tx.originalAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const badgeBg = tx.type === "pago"
      ? "bg-indigo-500/20 text-indigo-300 border-l-indigo-500"
      : "bg-amber-500/20 text-amber-300 border-l-amber-500";
    const badgeText = tx.type === "pago" ? "Pago" : "Ajuste";
    const amountColor = tx.type === "pago"
      ? "text-indigo-400"
      : "text-amber-400";

    let label = "";
    if (isPayer && recipientUser) {
      label = `Le pagaste a ${recipientUser.name}`;
    } else if (!isPayer && payerUser) {
      label = `Te pag\u00f3 ${payerUser.name}`;
    }

    return (
      <div
        class={`bg-card p-5 rounded-custom border-l-4 ${badgeBg} border border-white/5 flex justify-between items-center`}
      >
        <div class="flex flex-col">
          <span class="text-lg font-semibold text-white flex items-center gap-2">
            {tx.description}
            <span
              class={`text-xs font-medium px-2 py-0.5 rounded ${badgeBg}`}
            >
              {badgeText}
            </span>
          </span>
          <span class="text-sm text-gray-500">
            {tx.createdAt.toLocaleDateString("es-MX", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })} &bull;{" "}
            {tx.createdAt.toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {label && (
              <>
                {" "}&bull;{" "}
                <span class={amountColor}>{label}</span>
              </>
            )}
            {relatedDescription && (
              <>
                {" "}&bull;{" "}
                <span class="text-slate-400">
                  Vinculado: {relatedDescription}
                </span>
              </>
            )}
          </span>
        </div>
        <div class="text-right flex flex-col items-end">
          <span class={`text-xl font-bold ${amountColor}`}>
            {isPayer ? "+" : "-"}${formattedAmount}
          </span>
        </div>
      </div>
    );
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
  const isPositive = personalBalance >= 0;

  return (
    <div class="bg-card p-5 rounded-custom border border-white/5 flex justify-between items-center">
      <div class="flex flex-col">
        <span class="text-lg font-semibold text-white">{tx.description}</span>
        <span class="text-sm text-gray-500">
          {tx.createdAt.toLocaleDateString("es-MX", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })} &bull;{" "}
          {tx.createdAt.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {paidByUser && (
            <>
              {" "}&bull;{" "}
              <span class={`text-xs px-1.5 py-0.5 rounded ${
                isPaidByMe
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-slate-300 text-slate-800 font-bold"
              }`}>
                {isPaidByMe ? "Tú pagaste" : paidByUser.name}
              </span>
            </>
          )}
          {tx.type === "parcialidad" && tx.installmentCurrent &&
            tx.installmentTotal && (
            <>
              {" "}&bull;{" "}
              <span class="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">
                {tx.installmentCurrent}/{tx.installmentTotal}
              </span>
            </>
          )}
        </span>
      </div>
      <div class="text-right flex flex-col items-end">
        <span
          class={`text-xl font-bold ${
            isPositive ? "text-green-500" : "text-red-500"
          }`}
        >
          {isPositive ? "+" : "-"}{" "}
          ${Math.abs(personalBalance).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <span class="text-xs text-slate-500">
          de ${perInstallmentTotal.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
    </div>
  );
}
