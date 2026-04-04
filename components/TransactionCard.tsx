import type { Transaction, User } from "../lib/types.ts";

interface TransactionCardProps {
  transaction: Transaction;
  paidByUser: User | null;
  currentUserId: string;
  allUsers?: User[];
}

export default function TransactionCard(props: TransactionCardProps) {
  const { transaction: tx, paidByUser, currentUserId, allUsers } = props;

  if (tx.type === "pago") {
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

    let label = "";
    if (isPayer && recipientUser) {
      label = `Le pagaste a ${recipientUser.name}`;
    } else if (!isPayer && payerUser) {
      label = `Te pagó ${payerUser.name}`;
    }

    return (
      <div class="bg-card p-5 rounded-custom border-l-4 border-l-indigo-500 border border-white/5 flex justify-between items-center">
        <div class="flex flex-col">
          <span class="text-lg font-semibold text-white flex items-center gap-2">
            {tx.description}
            <span class="text-xs font-medium px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
              Pago
            </span>
          </span>
          <span class="text-sm text-gray-500">
            {tx.createdAt.toLocaleDateString("es-MX", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })} &bull; {tx.createdAt.toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {label && (
              <>
                {" "}&bull; <span class="text-indigo-400">{label}</span>
              </>
            )}
          </span>
        </div>
        <div class="text-right flex flex-col items-end">
          <span class="text-xl font-bold text-indigo-400">
            ${formattedAmount}
          </span>
        </div>
      </div>
    );
  }

  const isPaidByMe = tx.userPaid === currentUserId;
  const userSplit = tx.splitJson.splits.find((s) => s.userId === currentUserId);
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
          })} &bull; {tx.createdAt.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {paidByUser && (
            <>
              {" "}&bull;{" "}
              <span class={isPaidByMe ? "text-primary" : "text-slate-400"}>
                {isPaidByMe ? "Tú pagaste" : paidByUser.name}
              </span>
            </>
          )}
          {tx.type === "parcialidad" && tx.installmentCurrent &&
            tx.installmentTotal && (
            <>
              {" "}&bull;{" "}
              <span class="text-primary">
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
          {isPositive ? "+" : "-"}${Math.abs(personalBalance).toLocaleString(
            "en-US",
            { minimumFractionDigits: 2, maximumFractionDigits: 2 },
          )}
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
