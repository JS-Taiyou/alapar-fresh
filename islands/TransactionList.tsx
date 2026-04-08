import { type Signal, useComputed, useSignal } from "@preact/signals";
import type {
  BalanceBreakdownEntry,
  DefaultSplit,
  Participant,
  SplitEntry,
  TransactionSplit,
} from "../lib/types.ts";
import { type EnrichedTransaction } from "./shared-signals.ts";
import {
  calculateBalance,
  calculatePairwiseBreakdown,
  computeDefaultPercentages,
} from "../lib/calculations.ts";

interface TransactionListProps {
  transactions: Signal<EnrichedTransaction[]>;
  users: Signal<Participant[]>;
  currentUserId: Signal<string>;
  registryId: Signal<string>;
  balance: Signal<number>;
  balanceEntries: Signal<BalanceBreakdownEntry[]>;
  defaultSplit: Signal<DefaultSplit | null>;
  entityIds: Set<string>;
}

type SplitMode = "auto" | "percentage" | "fixed";
type TransactionType =
  | "unico"
  | "parcialidad"
  | "recurrente"
  | "pago"
  | "ajuste";

function sanitizeDecimal(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const dotIdx = v.indexOf(".");
  if (dotIdx !== -1) {
    v = v.slice(0, dotIdx + 1) + v.slice(dotIdx + 1).replace(/\./g, "");
    const parts = v.split(".");
    if (parts[1] && parts[1].length > 2) {
      parts[1] = parts[1].slice(0, 2);
      v = parts.join(".");
    }
  }
  return v;
}

function sanitizeInteger(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

function TransactionCardClickable(props: {
  tx: EnrichedTransaction;
  users: Participant[];
  currentUserId: string;
  onClick: () => void;
}) {
  const { tx, users, currentUserId } = props;

  if (tx.type === "ajuste") {
    const formattedAmount = tx.originalAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return (
      <div class="w-full text-left bg-card p-5 rounded-custom border-l-4 border-l-amber-500 border border-white/5 flex justify-between items-center">
        <div class="flex flex-col">
          <span class="text-lg font-semibold text-white flex items-center gap-2">
            {tx.description}
            <span class="text-xs font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
              Saldo pendiente
            </span>
          </span>
          <span class="text-sm text-gray-500">
            {new Date(tx.createdAt).toLocaleDateString("es-MX", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })} &bull; {new Date(tx.createdAt).toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div class="text-right flex flex-col items-end">
          <span class="text-xl font-bold text-amber-400">
            ${formattedAmount}
          </span>
        </div>
      </div>
    );
  }

  if (tx.type === "pago") {
    const isPayer = tx.userPaid === currentUserId;
    const recipientSplit = tx.splitJson.splits[0];
    const recipientUser = recipientSplit
      ? users.find((u) => u.id === recipientSplit.userId)
      : null;
    const payerUser = tx.paidByUser;
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
      <button
        type="button"
        onClick={props.onClick}
        class="w-full text-left bg-card p-5 rounded-custom border-l-4 border-l-indigo-500 border border-white/5 flex justify-between items-center transition-transform active:scale-[0.98] hover:bg-white/[0.02]"
      >
        <div class="flex flex-col">
          <span class="text-lg font-semibold text-white flex items-center gap-2">
            {tx.description}
            <span class="text-xs font-medium px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
              Pago
            </span>
          </span>
          <span class="text-sm text-gray-500">
            {new Date(tx.createdAt).toLocaleDateString("es-MX", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })} &bull; {new Date(tx.createdAt).toLocaleTimeString("es-MX", {
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
      </button>
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
    <button
      type="button"
      onClick={props.onClick}
      class="w-full text-left bg-card p-5 rounded-custom border border-white/5 flex justify-between items-center transition-transform active:scale-[0.98] hover:bg-white/[0.02]"
    >
      <div class="flex flex-col">
        <span class="text-lg font-semibold text-white">{tx.description}</span>
        <span class="text-sm text-gray-500">
          {new Date(tx.createdAt).toLocaleDateString("es-MX", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })} &bull; {new Date(tx.createdAt).toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {tx.paidByUser && (
            <>
              {" "}&bull;{" "}
              <span class={`text-xs px-1.5 py-0.5 rounded ${
                isPaidByMe
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-slate-300 text-slate-800 font-bold"
              }`}>
                {isPaidByMe ? "Tú pagaste" : tx.paidByUser.name}
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
    </button>
  );
}

export default function TransactionList(props: TransactionListProps) {
  const transactions = props.transactions;
  const users = props.users;
  const currentUserId = props.currentUserId;
  const registryId = props.registryId;
  const defaultSplit = props.defaultSplit;
  const balance = props.balance;
  const balanceEntries = props.balanceEntries;

  function recalculate() {
    balance.value = calculateBalance(transactions.value, currentUserId.value);
    balanceEntries.value = calculatePairwiseBreakdown(
      transactions.value,
      currentUserId.value,
      users.value,
    );
  }

  const isOpen = useSignal(false);
  const editingId = useSignal<string | null>(null);
  const submitting = useSignal(false);
  const searchQuery = useSignal("");
  const filterUserId = useSignal<string | null>(null);
  const amount = useSignal(0);
  const description = useSignal("");
  const notes = useSignal("");
  const expenseType = useSignal<TransactionType>("unico");
  const installmentCurrent = useSignal(1);
  const installmentTotal = useSignal(12);
  const installmentInputMode = useSignal<"total" | "installment">("total");
  const installmentAmount = useSignal(0);
  const splitMode = useSignal<SplitMode>("auto");
  const userPaid = useSignal(currentUserId.value);
  const paymentRecipient = useSignal<string>(
    users.value.find((u) => u.id !== currentUserId.value)?.id ?? "",
  );
  const percentages = useSignal<Record<string, number>>(
    computeDefaultPercentages(users.value, defaultSplit.value),
  );
  const fixedAmounts = useSignal<Record<string, number>>(
    Object.fromEntries(users.value.map((u) => [u.id, 0])),
  );

  const isEditing = useComputed(() => editingId.value !== null);

  function buildDefaultPercentages(): Record<string, number> {
    return computeDefaultPercentages(users.value, defaultSplit.value);
  }

  function saveLastSplitConfig() {
    if (expenseType.value === "pago" || splitMode.value !== "percentage") {
      return;
    }
    const key = `lastSplit_${registryId.value}`;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          percentages: percentages.value,
          userPaid: userPaid.value,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch { /* ignore storage errors */ }
  }

  function loadLastSplitConfig(): {
    percentages: Record<string, number>;
    userPaid: string;
  } | null {
    const key = `lastSplit_${registryId.value}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.savedAt) {
        localStorage.removeItem(key);
        return null;
      }
      const savedDate = new Date(parsed.savedAt);
      const today = new Date();
      if (savedDate.toDateString() !== today.toDateString()) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function resetForm() {
    amount.value = 0;
    description.value = "";
    notes.value = "";
    expenseType.value = "unico";
    installmentCurrent.value = 1;
    installmentTotal.value = 12;
    installmentInputMode.value = "total";
    installmentAmount.value = 0;
    paymentRecipient.value =
      users.value.find((u) => u.id !== currentUserId.value)?.id ?? "";

    const lastConfig = loadLastSplitConfig();
    if (lastConfig) {
      splitMode.value = "percentage";
      percentages.value = lastConfig.percentages;
      userPaid.value = lastConfig.userPaid;
    } else {
      userPaid.value = currentUserId.value;
      if (
        defaultSplit.value &&
        defaultSplit.value.splits.length === users.value.length
      ) {
        splitMode.value = "percentage";
        percentages.value = buildDefaultPercentages();
      } else {
        splitMode.value = "auto";
        percentages.value = buildDefaultPercentages();
      }
      fixedAmounts.value = Object.fromEntries(
        users.value.map((u) => [u.id, 0]),
      );
    }
    editingId.value = null;
  }

  function openNew() {
    resetForm();
    isOpen.value = true;
  }

  function openEdit(tx: EnrichedTransaction) {
    editingId.value = tx.id;
    amount.value = tx.originalAmount;
    description.value = tx.description;
    notes.value = tx.notes || "";
    expenseType.value = tx.type;
    installmentCurrent.value = tx.installmentCurrent ?? 1;
    installmentTotal.value = tx.installmentTotal ?? 12;
    installmentInputMode.value = "total";
    installmentAmount.value = tx.installmentTotal
      ? Math.round((tx.originalAmount / tx.installmentTotal) * 100) / 100
      : 0;
    userPaid.value = tx.userPaid;

    if (tx.type === "pago") {
      const recipientSplit = tx.splitJson.splits[0];
      if (recipientSplit) {
        paymentRecipient.value = recipientSplit.userId;
      }
    } else {
      const splits = tx.splitJson.splits;
      const total = splits.reduce((s, sp) => s + sp.amount, 0);
      const hasCustomPercentages = splits.some((sp) =>
        Math.abs(sp.percentage - (100 / splits.length)) >= 0.5
      );

      if (hasCustomPercentages) {
        const allFixed = Math.abs(total - tx.originalAmount) < 0.01;
        if (!allFixed) {
          splitMode.value = "percentage";
          percentages.value = Object.fromEntries(
            splits.map((s) => [s.userId, s.percentage]),
          );
        } else {
          splitMode.value = "fixed";
          fixedAmounts.value = Object.fromEntries(
            splits.map((s) => [s.userId, s.amount]),
          );
        }
      } else {
        splitMode.value = "auto";
      }
    }

    isOpen.value = true;
  }

  function getSplits(): SplitEntry[] {
    const total = Math.abs(amount.value);
    if (splitMode.value === "auto") {
      const count = users.value.length;
      const perPerson = Math.floor((total / count) * 100) / 100;
      const remainder = Math.round((total - perPerson * count) * 100) / 100;
      return users.value.map((u, i) => ({
        userId: u.id,
        percentage: Math.round((100 / count) * 100) / 100,
        amount: perPerson + (i === 0 ? remainder : 0),
      }));
    }
    if (splitMode.value === "percentage") {
      return users.value.map((u) => ({
        userId: u.id,
        percentage: percentages.value[u.id] ?? 0,
        amount: Math.round(total * (percentages.value[u.id] ?? 0)) / 100,
      }));
    }
    return users.value.map((u) => ({
      userId: u.id,
      percentage: total > 0
        ? Math.round(((fixedAmounts.value[u.id] ?? 0) / total) * 10000) / 100
        : 0,
      amount: fixedAmounts.value[u.id] ?? 0,
    }));
  }

  function handleAmountChange(raw: string) {
    const sanitized = sanitizeDecimal(raw);
    const newVal = parseFloat(sanitized) || 0;

    if (
      editingId.value &&
      expenseType.value !== "pago" &&
      Math.abs(newVal - amount.value) > 0.001
    ) {
      const currentSplits = getSplits();
      const total = Math.abs(amount.value);
      percentages.value = Object.fromEntries(
        currentSplits.map((s) => [
          s.userId,
          total > 0
            ? Math.round((s.amount / total) * 10000) / 100
            : Math.round(10000 / users.value.length) / 100,
        ]),
      );
      splitMode.value = "percentage";
    }

    amount.value = newVal;
    return sanitized;
  }

  function handleInstallmentAmountChange(raw: string) {
    const sanitized = sanitizeDecimal(raw);
    const newVal = parseFloat(sanitized) || 0;
    installmentAmount.value = newVal;
    const total = Math.round(newVal * installmentTotal.value * 100) / 100;

    if (
      editingId.value &&
      Math.abs(total - amount.value) > 0.001
    ) {
      const currentSplits = getSplits();
      const currentTotal = Math.abs(amount.value);
      percentages.value = Object.fromEntries(
        currentSplits.map((s) => [
          s.userId,
          currentTotal > 0
            ? Math.round((s.amount / currentTotal) * 10000) / 100
            : Math.round(10000 / users.value.length) / 100,
        ]),
      );
      splitMode.value = "percentage";
    }

    amount.value = total;
    return sanitized;
  }

  function totalPercentage(): number {
    return Object.values(percentages.value).reduce((s, v) => s + v, 0);
  }

  function autoComplementPercentage(userId: string) {
    if (users.value.length === 2) {
      const otherId = users.value.find((u) => u.id !== userId)?.id;
      if (otherId) {
        const newPcts = { ...percentages.value };
        newPcts[otherId] = Math.round((100 - (newPcts[userId] ?? 0)) * 100) /
          100;
        if (newPcts[otherId] < 0) newPcts[otherId] = 0;
        percentages.value = newPcts;
      }
    }
  }

  function updatePercentage(userId: string, raw: string) {
    let v = Math.min(parseFloat(raw) || 0, 100);
    if (v < 0) v = 0;
    percentages.value = { ...percentages.value, [userId]: v };
    autoComplementPercentage(userId);
  }

  function autoComplementFixed(userId: string) {
    if (users.value.length === 2) {
      const otherId = users.value.find((u) => u.id !== userId)?.id;
      if (otherId) {
        const newAmounts = { ...fixedAmounts.value };
        newAmounts[otherId] = Math.round(
          (Math.abs(amount.value) - (newAmounts[userId] ?? 0)) * 100,
        ) / 100;
        if (newAmounts[otherId] < 0) newAmounts[otherId] = 0;
        fixedAmounts.value = newAmounts;
      }
    }
  }

  function updateFixedAmount(userId: string, raw: string) {
    const total = Math.abs(amount.value);
    let v = Math.min(parseFloat(raw) || 0, total);
    if (v < 0) v = 0;
    fixedAmounts.value = { ...fixedAmounts.value, [userId]: v };
    autoComplementFixed(userId);
  }

  function setAutoSplit() {
    splitMode.value = "auto";
    percentages.value = Object.fromEntries(
      users.value.map((
        u,
      ) => [u.id, Math.round((100 / users.value.length) * 100) / 100]),
    );
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.value) return;

    let splitJson: TransactionSplit;

    if (expenseType.value === "pago") {
      splitJson = {
        splits: [{
          userId: paymentRecipient.value,
          percentage: 100,
          amount: Math.abs(amount.value),
        }],
      };
    } else {
      splitJson = { splits: getSplits() };
    }

    const paidByUser = users.value.find((u) => u.id === userPaid.value) ??
      null;

    const optimisticId = editingId.value ?? crypto.randomUUID();

    const optimistic: EnrichedTransaction = {
      id: optimisticId,
      registry_id: registryId.value,
      description: description.value || "Pago",
      amount: amount.value,
      originalAmount: Math.abs(amount.value),
      type: expenseType.value,
      exerciseId: null,
      installmentCurrent: expenseType.value === "parcialidad"
        ? installmentCurrent.value
        : null,
      installmentTotal: expenseType.value === "parcialidad"
        ? installmentTotal.value
        : null,
      recurringDisabled: false,
      recurringGroupId: optimisticId,
      notes: notes.value,
      splitJson,
      creatorId: currentUserId.value,
      userPaid: userPaid.value,
      createdAt: new Date(),
      paidByUser,
    };

    const wasEditing = editingId.value;

    if (wasEditing) {
      transactions.value = transactions.value.map((t) =>
        t.id === wasEditing ? optimistic : t
      );
    } else {
      transactions.value = [optimistic, ...transactions.value];
    }

    isOpen.value = false;
    editingId.value = null;
    recalculate();

    const form = new FormData();
    form.append("description", optimistic.description);
    form.append("amount", optimistic.amount.toString());
    form.append("originalAmount", optimistic.originalAmount.toString());
    form.append("type", optimistic.type);
    form.append("splitJson", JSON.stringify(splitJson));
    form.append("userPaid", optimistic.userPaid);
    form.append("notes", optimistic.notes);
    form.append("registryId", optimistic.registry_id);
    if (optimistic.type === "parcialidad") {
      form.append("installmentCurrent", installmentCurrent.value.toString());
      form.append("installmentTotal", installmentTotal.value.toString());
    }

    try {
      if (wasEditing) {
        const res = await fetch(`/api/transactions/${wasEditing}`, {
          method: "PUT",
          body: form,
        });
        if (res.ok) {
          const updated = await res.json();
          const serverPaidBy = users.value.find((u) =>
            u.id === updated.userPaid
          ) ?? null;
          transactions.value = transactions.value.map((t) =>
            t.id === wasEditing
              ? { ...updated, paidByUser: serverPaidBy }
              : t
          );
          recalculate();
        }
      } else {
        const res = await fetch("/api/transactions", {
          method: "POST",
          body: form,
        });
        if (res.ok) {
          const created = await res.json();
          const serverPaidBy = users.value.find((u) =>
            u.id === created.userPaid
          ) ?? null;
          transactions.value = transactions.value.map((t) =>
            t.id === optimisticId
              ? { ...created, paidByUser: serverPaidBy }
              : t
          );
          recalculate();
        }
        saveLastSplitConfig();
      }
    } catch {
      // server response will correct on next page load
    }
  }

  function handleDelete() {
    if (!editingId.value) return;
    if (!confirm("Eliminar esta transacción?")) return;
    const id = editingId.value;
    transactions.value = transactions.value.filter((t) => t.id !== id);
    isOpen.value = false;
    editingId.value = null;
    recalculate();
    fetch(`/api/transactions/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const filteredTransactions = useComputed(() => {
    let list = transactions.value;
    if (filterUserId.value) {
      list = list.filter((tx) => tx.userPaid === filterUserId.value);
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      list = list.filter((tx) => tx.description.toLowerCase().includes(q));
    }
    return list;
  });

  const splits = useComputed(() => getSplits());
  const totalSplitAmount = splits.value.reduce((s, sp) => s + sp.amount, 0);
  const totalPct = splitMode.value === "percentage"
    ? totalPercentage()
    : splits.value.reduce((s, sp) => s + sp.percentage, 0);

  const isPago = expenseType.value === "pago";
  const modalTitle = isPago
    ? (isEditing.value ? "Editar Pago" : "Nuevo Pago")
    : (isEditing.value ? "Editar Gasto" : "Nuevo Gasto");
  const modalSubtitle = isPago
    ? (isEditing.value
      ? "Modifica los detalles del pago."
      : "Registra un pago entre usuarios.")
    : (isEditing.value
      ? "Modifica los detalles del gasto."
      : "Configura cómo se divide este gasto.");

  return (
    <>
      <main class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 relative">
        <div class="flex justify-between items-center mb-2">
          <h2 class="text-lg font-semibold text-gray-200">
            Ejercicio actual
          </h2>
        </div>

        <div class="space-y-3">
          <div class="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => filterUserId.value = null}
              class={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                filterUserId.value === null
                  ? "bg-primary text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border border-white/10"
              }`}
            >
              Todos
            </button>
            {users.value.map((user) => {
              const initials = user.name.split(" ").map((n) => n[0]).join("")
                .substring(0, 2).toUpperCase();
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    filterUserId.value = filterUserId.value === user.id
                      ? null
                      : user.id;
                  }}
                  class={`text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                    filterUserId.value === user.id
                      ? "text-white shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-white/10"
                  }`}
                  style={filterUserId.value === user.id
                    ? `background-color: ${user.color}`
                    : ""}
                >
                  <div
                    class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                    style={`background-color: ${user.color}30; color: ${user.color}`}
                  >
                    {initials}
                  </div>
                  {user.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <div class="relative">
            <svg
              class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            <input
              type="text"
              placeholder="Buscar transacción..."
              value={searchQuery.value}
              onInput={(e) =>
                searchQuery.value = (e.target as HTMLInputElement).value}
              class="w-full pl-9 pr-4 py-2 bg-background border border-border-custom rounded-custom text-sm text-white placeholder-slate-500 focus:ring-primary focus:border-primary"
            />
            {searchQuery.value && (
              <button
                type="button"
                onClick={() => searchQuery.value = ""}
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {transactions.value.length === 0
          ? (
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <div class="bg-slate-800 p-4 rounded-full mb-4">
                <svg
                  class="h-12 w-12 text-slate-600"
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
              <h3 class="text-lg font-medium text-slate-300">
                Sin transacciones
              </h3>
              <p class="text-slate-500 mt-2">
                Agrega un gasto usando el botón +
              </p>
            </div>
          )
          : filteredTransactions.value.length === 0
          ? (
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <p class="text-slate-500">
                No se encontraron transacciones con estos filtros.
              </p>
              <button
                type="button"
                onClick={() => {
                  searchQuery.value = "";
                  filterUserId.value = null;
                }}
                class="mt-2 text-sm text-primary hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )
          : filteredTransactions.value.map((tx) => (
            <TransactionCardClickable
              key={tx.id}
              tx={tx}
              users={users.value}
              currentUserId={currentUserId.value}
              onClick={() => tx.type !== "ajuste" && openEdit(tx)}
            />
          ))}
        <div class="h-24" />
      </main>

      <button
        onClick={openNew}
        class="fixed bottom-8 right-8 w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all z-50"
      >
        <svg
          class="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 4v16m8-8H4"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
          />
        </svg>
      </button>

      {isOpen.value && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <div class="bg-surface border border-border-custom w-full max-w-2xl rounded-custom shadow-2xl flex flex-col overflow-hidden">
            <header class="px-6 py-4 border-b border-border-custom flex justify-between items-center">
              <div>
                <h2 class="text-xl font-bold text-white">{modalTitle}</h2>
                <p class="text-sm text-slate-400">{modalSubtitle}</p>
              </div>
              <button
                onClick={() => {
                  isOpen.value = false;
                  editingId.value = null;
                }}
                class="text-slate-400 hover:text-white transition-colors"
              >
                <svg
                  class="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
              </button>
            </header>

            <form
              onSubmit={handleSubmit}
              class="p-6 space-y-8 overflow-y-auto max-h-[75vh]"
            >
              <div class="space-y-2">
                <label
                  class="block text-sm font-medium text-slate-300"
                  for="description"
                >
                  Descripción
                </label>
                <input
                  class="block w-full px-4 py-2.5 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
                  id="description"
                  type="text"
                  placeholder={isPago
                    ? "Ej: Pago de balance"
                    : "Ej: Supermercado semanal"}
                  value={description.value}
                  onInput={(e) =>
                    description.value = (e.target as HTMLInputElement).value}
                  {...(isPago ? {} : { required: true })}
                />
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-2">
                  <label
                    class="block text-sm font-medium text-slate-300"
                    for="total-amount"
                  >
                    {isPago
                      ? "Monto del Pago"
                      : expenseType.value === "parcialidad" &&
                          installmentInputMode.value === "installment"
                        ? "Monto por Parcialidad"
                        : "Monto Total"}
                  </label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      $
                    </span>
                    <input
                      class="block w-full pl-8 pr-4 py-2.5 bg-background border border-border-custom rounded-custom text-white text-lg font-semibold focus:ring-primary focus:border-primary"
                      id="total-amount"
                      type="text"
                      inputmode="decimal"
                      value={expenseType.value === "parcialidad" &&
                          installmentInputMode.value === "installment"
                        ? installmentAmount.value || ""
                        : amount.value || ""}
                      onInput={(e) => {
                        if (
                          expenseType.value === "parcialidad" &&
                          installmentInputMode.value === "installment"
                        ) {
                          const sanitized =
                            handleInstallmentAmountChange(
                              (e.target as HTMLInputElement).value,
                            );
                          (e.target as HTMLInputElement).value = sanitized;
                        } else {
                          const sanitized = handleAmountChange(
                            (e.target as HTMLInputElement).value,
                          );
                          (e.target as HTMLInputElement).value = sanitized;
                        }
                      }}
                      required
                    />
                  </div>
                  {expenseType.value === "parcialidad" &&
                    installmentInputMode.value === "installment" &&
                    installmentTotal.value > 0 && (
                    <p class="text-xs text-slate-400 mt-1">
                      Total: ${Math.abs(amount.value).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} ({installmentTotal.value} parcialidades)
                    </p>
                  )}
                </div>
                <div class="space-y-2">
                  <label class="block text-sm font-medium text-slate-300">
                    Tipo
                  </label>
                  <div class="flex gap-1 p-1 bg-background border border-border-custom rounded-custom">
                    {([
                      "unico",
                      "parcialidad",
                      "recurrente",
                      "pago",
                    ] as TransactionType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => expenseType.value = t}
                        class={`flex-1 py-2 text-sm font-medium rounded-custom transition-colors ${
                          expenseType.value === t
                            ? t === "pago"
                              ? "bg-indigo-500 text-white shadow-sm"
                              : "bg-primary text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {t === "unico"
                          ? "Único"
                          : t === "parcialidad"
                          ? "Parcialidad"
                          : t === "recurrente"
                          ? "Recurrente"
                          : "Pago"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {expenseType.value === "parcialidad" && (
                <div class="space-y-4">
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        installmentInputMode.value = "total";
                      }}
                      class={`flex-1 py-1.5 text-xs font-medium rounded-custom transition-colors border ${
                        installmentInputMode.value === "total"
                          ? "bg-primary/20 border-primary text-white"
                          : "bg-background border-border-custom text-slate-400 hover:text-white"
                      }`}
                    >
                      Monto Total
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        installmentInputMode.value = "installment";
                        if (installmentAmount.value === 0 && amount.value > 0) {
                          installmentAmount.value =
                            Math.round((amount.value / installmentTotal.value) * 100) /
                            100;
                        }
                      }}
                      class={`flex-1 py-1.5 text-xs font-medium rounded-custom transition-colors border ${
                        installmentInputMode.value === "installment"
                          ? "bg-primary/20 border-primary text-white"
                          : "bg-background border-border-custom text-slate-400 hover:text-white"
                      }`}
                    >
                      Monto por Parcialidad
                    </button>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="space-y-2">
                      <label class="block text-sm font-medium text-slate-300">
                        Parcialidad Actual
                      </label>
                      <div class="flex items-center gap-3">
                        <select
                          class="block w-full px-4 py-2 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
                          value={installmentCurrent.value}
                          onChange={(e) =>
                            installmentCurrent.value = parseInt(
                              (e.target as HTMLSelectElement).value,
                            )}
                        >
                          {Array.from(
                            { length: installmentTotal.value },
                            (_, i) => (
                              <option key={i + 1} value={i + 1}>{i + 1}</option>
                            ),
                          )}
                        </select>
                        <span class="text-slate-500">de</span>
                        <input
                          class="block w-20 px-4 py-2 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
                          type="text"
                          inputmode="numeric"
                          value={installmentTotal.value}
                          onInput={(e) => {
                            const sanitized = sanitizeInteger(
                              (e.target as HTMLInputElement).value,
                            );
                            (e.target as HTMLInputElement).value = sanitized;
                            const newTotal = parseInt(sanitized) || 12;
                            installmentTotal.value = newTotal;
                            if (installmentInputMode.value === "installment") {
                              amount.value = Math.round(
                                installmentAmount.value * newTotal * 100,
                              ) / 100;
                            }
                          }}
                        />
                        <span class="text-slate-500">meses</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div class="space-y-2">
                <label
                  class="block text-sm font-medium text-slate-300"
                  for="notes"
                >
                  Notas (opcional)
                </label>
                <textarea
                  class="block w-full px-4 py-2.5 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary resize-none"
                  id="notes"
                  rows={2}
                  placeholder="Notas adicionales..."
                  value={notes.value}
                  onInput={(e) =>
                    notes.value = (e.target as HTMLTextAreaElement).value}
                />
              </div>

              {isPago
                ? (
                  <section class="space-y-4">
                    <h3 class="text-sm font-bold uppercase tracking-wider text-slate-500">
                      Transferencia
                    </h3>
                    <div class="border border-border-custom rounded-custom overflow-hidden">
                      <table class="hidden md:table w-full text-left border-collapse">
                        <thead class="bg-slate-800/50">
                          <tr>
                            <th class="px-4 py-3 text-xs font-semibold text-slate-400">
                              USUARIO
                            </th>
                            <th class="px-4 py-3 text-xs font-semibold text-slate-400 w-24 text-center">
                              Pagó
                            </th>
                            <th class="px-4 py-3 text-xs font-semibold text-slate-400 w-24 text-center">
                              Recibió
                            </th>
                            {users.value.length > 2 && (
                              <th class="px-4 py-3 text-xs font-semibold text-slate-400 text-right">
                                SALDO
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border-custom">
                          {users.value.map((user) => {
                            const initials = user.name.split(" ").map((n) =>
                              n[0]
                            ).join("").substring(0, 2).toUpperCase();
                            return (
                              <tr key={user.id}>
                                <td class="px-4 py-3">
                                  <div class="flex items-center gap-3">
                                    <div
                                      class="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                      style={`background-color: ${user.color}30; color: ${user.color}`}
                                    >
                                      {initials}
                                    </div>
                                    <span class="text-sm font-medium text-white">
                                      {user.name}
                                      {user.id === currentUserId.value && (
                                        <span class="text-slate-500 ml-1">
                                          (Tú)
                                        </span>
                                      )}
                                      {props.entityIds.has(user.id) && (
                                        <span class="text-xs ml-1 px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                                          tercero
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </td>
                                <td class="px-4 py-3 text-center">
                                  <input
                                    type="radio"
                                    name="pagoPaid"
                                    value={user.id}
                                    checked={userPaid.value === user.id}
                                    onChange={() => {
                                      userPaid.value = user.id;
                                      if (paymentRecipient.value === user.id) {
                                        paymentRecipient.value =
                                          users.value.find((u) =>
                                            u.id !== user.id
                                          )?.id ?? "";
                                      }
                                    }}
                                    class="accent-primary"
                                  />
                                </td>
                                <td class="px-4 py-3 text-center">
                                  <input
                                    type="radio"
                                    name="pagoRecipient"
                                    value={user.id}
                                    checked={paymentRecipient.value === user.id}
                                    onChange={() => {
                                      paymentRecipient.value = user.id;
                                      if (userPaid.value === user.id) {
                                        userPaid.value = users.value.find((u) =>
                                          u.id !== user.id
                                        )?.id ?? currentUserId.value;
                                      }
                                    }}
                                    class="accent-indigo-400"
                                  />
                                </td>
                                {users.value.length > 2 && (
                                  <td class="px-4 py-3 text-right">
                                    {user.id !== currentUserId.value &&
                                      (() => {
                                        const bd = balanceEntries.value.find(
                                          (b) => b.userId === user.id,
                                        );
                                        if (!bd || Math.abs(bd.amount) < 0.01) {
                                          return null;
                                        }
                                        return bd.amount > 0
                                          ? (
                                            <span class="text-xs font-semibold text-green-400">
                                              Te debe ${bd.amount
                                                .toLocaleString(
                                                  "en-US",
                                                  {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  },
                                                )}
                                            </span>
                                          )
                                          : (
                                            <span class="text-xs font-semibold text-red-400">
                                              Le debes ${Math.abs(bd.amount)
                                                .toLocaleString(
                                                  "en-US",
                                                  {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  },
                                                )}
                                            </span>
                                          );
                                      })()}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      <div class="md:hidden divide-y divide-border-custom">
                        {users.value.map((user) => {
                          const initials = user.name.split(" ").map((n) => n[0])
                            .join("").substring(0, 2).toUpperCase();
                          const bd = users.value.length > 2 &&
                              user.id !== currentUserId.value
                            ? balanceEntries.value.find((b) =>
                              b.userId === user.id
                            )
                            : null;
                          return (
                            <div
                              key={user.id}
                              class="flex items-center gap-3 px-3 py-3"
                            >
                              <div class="flex flex-col items-center gap-1">
                                <span class="text-[9px] text-slate-500 uppercase">
                                  Pagó
                                </span>
                                <input
                                  type="radio"
                                  name="pagoPaidMobile"
                                  value={user.id}
                                  checked={userPaid.value === user.id}
                                  onChange={() => {
                                    userPaid.value = user.id;
                                    if (paymentRecipient.value === user.id) {
                                      paymentRecipient.value =
                                        users.value.find((u) =>
                                          u.id !== user.id
                                        )?.id ?? "";
                                    }
                                  }}
                                  class="accent-primary"
                                />
                              </div>
                              <div class="flex flex-col items-center gap-1">
                                <span class="text-[9px] text-slate-500 uppercase">
                                  Recibió
                                </span>
                                <input
                                  type="radio"
                                  name="pagoRecipientMobile"
                                  value={user.id}
                                  checked={paymentRecipient.value === user.id}
                                  onChange={() => {
                                    paymentRecipient.value = user.id;
                                    if (userPaid.value === user.id) {
                                      userPaid.value = users.value.find((u) =>
                                        u.id !== user.id
                                      )?.id ?? currentUserId.value;
                                    }
                                  }}
                                  class="accent-indigo-400"
                                />
                              </div>
                              <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                  <div
                                    class="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                    style={`background-color: ${user.color}30; color: ${user.color}`}
                                  >
                                    {initials}
                                  </div>
                                  <span class="text-sm font-medium text-white truncate">
                                    {user.name}
                                    {user.id === currentUserId.value && (
                                      <span class="text-slate-500 ml-1">
                                        (Tú)
                                      </span>
                                    )}
                                    {props.entityIds.has(user.id) && (
                                      <span class="text-xs ml-1 px-1 py-0.5 rounded bg-slate-700 text-slate-400">
                                        tercero
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {bd && Math.abs(bd.amount) >= 0.01 && (
                                  <span
                                    class={`text-xs font-semibold ${
                                      bd.amount > 0
                                        ? "text-green-400"
                                        : "text-red-400"
                                    } ml-8`}
                                  >
                                    {bd.amount > 0
                                      ? `Te debe $${
                                        bd.amount.toLocaleString("en-US", {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })
                                      }`
                                      : `Le debes $${
                                        Math.abs(bd.amount).toLocaleString(
                                          "en-US",
                                          {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          },
                                        )
                                      }`}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                )
                : (
                  <section class="space-y-4">
                    <div class="flex justify-between items-center">
                      <h3 class="text-sm font-bold uppercase tracking-wider text-slate-500">
                        División
                      </h3>
                      <div class="flex gap-2">
                        <button
                          type="button"
                          onClick={setAutoSplit}
                          class={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                            splitMode.value === "auto"
                              ? "bg-primary text-white shadow-sm"
                              : "text-slate-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          Auto
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (defaultSplit.value) {
                              splitMode.value = "percentage";
                              percentages.value = buildDefaultPercentages();
                            } else {
                              splitMode.value = "percentage";
                            }
                          }}
                          class={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                            splitMode.value === "percentage"
                              ? "bg-primary text-white shadow-sm"
                              : "text-slate-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          Porcentaje
                        </button>
                        <button
                          type="button"
                          onClick={() => splitMode.value = "fixed"}
                          class={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                            splitMode.value === "fixed"
                              ? "bg-primary text-white shadow-sm"
                              : "text-slate-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          Monto Fijo
                        </button>
                      </div>
                    </div>

                    <div class="border border-border-custom rounded-custom overflow-hidden">
                      <table class="hidden md:table w-full text-left border-collapse">
                        <thead class="bg-slate-800/50">
                          <tr>
                            <th class="px-4 py-3 text-xs font-semibold text-slate-400">
                              USUARIO
                            </th>
                            <th class="px-4 py-3 text-xs font-semibold text-slate-400 w-32 text-right">
                              %
                            </th>
                            <th class="px-4 py-3 text-xs font-semibold text-slate-400 w-40 text-right">
                              MONTO
                            </th>
                            <th class="px-4 py-3 text-xs font-semibold text-slate-400 w-16 text-center">
                              PAGÓ
                            </th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border-custom">
                          {users.value.map((user) => {
                            const split = splits.value.find((s) =>
                              s.userId === user.id
                            );
                            const initials = user.name.split(" ").map((n) =>
                              n[0]
                            ).join("").substring(0, 2).toUpperCase();
                            return (
                              <tr key={user.id}>
                                <td class="px-4 py-3">
                                  <div class="flex items-center gap-3">
                                    <div
                                      class="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                      style={`background-color: ${user.color}30; color: ${user.color}`}
                                    >
                                      {initials}
                                    </div>
                                    <span class="text-sm font-medium text-white">
                                      {user.name}
                                      {user.id === currentUserId.value && (
                                        <span class="text-slate-500 ml-1">
                                          (Tú)
                                        </span>
                                      )}
                                      {props.entityIds.has(user.id) && (
                                        <span class="text-xs ml-1 px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                                          tercero
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </td>
                                <td class="px-4 py-3">
                                  <div class="flex items-center justify-end">
                                    {splitMode.value === "percentage"
                                      ? (
                                        <input
                                          class="w-16 bg-transparent border-0 text-right text-sm font-medium text-white focus:ring-0 p-0"
                                          type="text"
                                          inputmode="decimal"
                                          value={percentages.value[user.id] ??
                                            0}
                                          onInput={(e) => {
                                            const sanitized = sanitizeDecimal(
                                              (e.target as HTMLInputElement)
                                                .value,
                                            );
                                            (e.target as HTMLInputElement)
                                              .value = sanitized;
                                            updatePercentage(
                                              user.id,
                                              sanitized,
                                            );
                                          }}
                                        />
                                      )
                                      : (
                                        <span class="text-sm text-slate-400">
                                          {split?.percentage.toFixed(0) ?? 0}
                                        </span>
                                      )}
                                    <span class="ml-1 text-slate-500">%</span>
                                  </div>
                                </td>
                                <td class="px-4 py-3">
                                  <div class="flex items-center justify-end">
                                    {splitMode.value === "fixed"
                                      ? (
                                        <input
                                          class="w-24 bg-transparent border-0 text-right text-sm font-medium text-white focus:ring-0 p-0"
                                          type="text"
                                          inputmode="decimal"
                                          value={fixedAmounts.value[user.id] ??
                                            0}
                                          onInput={(e) => {
                                            const sanitized = sanitizeDecimal(
                                              (e.target as HTMLInputElement)
                                                .value,
                                            );
                                            (e.target as HTMLInputElement)
                                              .value = sanitized;
                                            updateFixedAmount(
                                              user.id,
                                              sanitized,
                                            );
                                          }}
                                        />
                                      )
                                      : (
                                        <span class="text-sm text-white">
                                          {split?.amount.toFixed(2) ?? "0.00"}
                                        </span>
                                      )}
                                    {splitMode.value === "fixed" && (
                                      <span class="ml-1 text-slate-500">$</span>
                                    )}
                                  </div>
                                </td>
                                <td class="px-4 py-3 text-center">
                                  <input
                                    type="radio"
                                    name="userPaid"
                                    value={user.id}
                                    checked={userPaid.value === user.id}
                                    onChange={() => userPaid.value = user.id}
                                    class="accent-primary"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot class="bg-slate-800/30">
                          <tr>
                            <td class="px-4 py-2 text-xs font-bold text-slate-400 italic">
                              TOTAL
                            </td>
                            <td
                              class={`px-4 py-2 text-right text-xs font-bold ${
                                Math.abs(totalPct - 100) < 0.01
                                  ? "text-white"
                                  : "text-red-400"
                              }`}
                            >
                              {totalPct.toFixed(0)}%
                            </td>
                            <td
                              class={`px-4 py-2 text-right text-xs font-bold ${
                                Math.abs(
                                    totalSplitAmount - Math.abs(amount.value),
                                  ) < 0.01
                                  ? "text-white"
                                  : "text-red-400"
                              }`}
                            >
                              ${totalSplitAmount.toFixed(2)}
                            </td>
                            <td class="px-4 py-2" />
                          </tr>
                        </tfoot>
                      </table>

                      <div class="md:hidden divide-y divide-border-custom">
                        {users.value.map((user) => {
                          const split = splits.value.find((s) =>
                            s.userId === user.id
                          );
                          const initials = user.name.split(" ").map((n) => n[0])
                            .join("").substring(0, 2).toUpperCase();
                          return (
                            <div
                              key={user.id}
                              class="flex items-start gap-3 px-3 py-3"
                            >
                              <div class="flex flex-col items-center gap-2 pt-0.5">
                                <input
                                  type="radio"
                                  name="userPaidMobile"
                                  value={user.id}
                                  checked={userPaid.value === user.id}
                                  onChange={() => userPaid.value = user.id}
                                  class="accent-primary"
                                />
                              </div>
                              <div class="flex-1 min-w-0 space-y-1.5">
                                <div class="flex items-center gap-2">
                                  <div
                                    class="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                    style={`background-color: ${user.color}30; color: ${user.color}`}
                                  >
                                    {initials}
                                  </div>
                                  <span class="text-sm font-medium text-white truncate">
                                    {user.name}
                                    {user.id === currentUserId.value && (
                                      <span class="text-slate-500 ml-1">
                                        (Tú)
                                      </span>
                                    )}
                                    {props.entityIds.has(user.id) && (
                                      <span class="text-xs ml-1 px-1 py-0.5 rounded bg-slate-700 text-slate-400">
                                        tercero
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div class="flex items-center gap-4 text-sm">
                                  <div class="flex items-center">
                                    {splitMode.value === "percentage"
                                      ? (
                                        <input
                                          class="w-14 bg-transparent border-0 text-right text-sm font-medium text-white focus:ring-0 p-0"
                                          type="text"
                                          inputmode="decimal"
                                          value={percentages.value[user.id] ??
                                            0}
                                          onInput={(e) => {
                                            const sanitized = sanitizeDecimal(
                                              (e.target as HTMLInputElement)
                                                .value,
                                            );
                                            (e.target as HTMLInputElement)
                                              .value = sanitized;
                                            updatePercentage(
                                              user.id,
                                              sanitized,
                                            );
                                          }}
                                        />
                                      )
                                      : (
                                        <span class="text-slate-400">
                                          {split?.percentage.toFixed(0) ?? 0}
                                        </span>
                                      )}
                                    <span class="ml-0.5 text-slate-500 text-xs">
                                      %
                                    </span>
                                  </div>
                                  <div class="flex items-center">
                                    {splitMode.value === "fixed"
                                      ? (
                                        <input
                                          class="w-20 bg-transparent border-0 text-right text-sm font-medium text-white focus:ring-0 p-0"
                                          type="text"
                                          inputmode="decimal"
                                          value={fixedAmounts.value[user.id] ??
                                            0}
                                          onInput={(e) => {
                                            const sanitized = sanitizeDecimal(
                                              (e.target as HTMLInputElement)
                                                .value,
                                            );
                                            (e.target as HTMLInputElement)
                                              .value = sanitized;
                                            updateFixedAmount(
                                              user.id,
                                              sanitized,
                                            );
                                          }}
                                        />
                                      )
                                      : (
                                        <span class="text-white">
                                          ${(split?.amount ?? 0).toFixed(2)}
                                        </span>
                                      )}
                                    {splitMode.value === "fixed" && (
                                      <span class="ml-0.5 text-slate-500 text-xs">
                                        $
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div class="flex items-center justify-between px-3 py-2 bg-slate-800/30">
                          <span class="text-xs font-bold text-slate-400 italic">
                            TOTAL
                          </span>
                          <div class="flex items-center gap-4">
                            <span
                              class={`text-xs font-bold ${
                                Math.abs(totalPct - 100) < 0.01
                                  ? "text-white"
                                  : "text-red-400"
                              }`}
                            >
                              {totalPct.toFixed(0)}%
                            </span>
                            <span
                              class={`text-xs font-bold ${
                                Math.abs(
                                    totalSplitAmount - Math.abs(amount.value),
                                  ) < 0.01
                                  ? "text-white"
                                  : "text-red-400"
                              }`}
                            >
                              ${totalSplitAmount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
            </form>

            <footer class="px-6 py-4 border-t border-border-custom bg-slate-800/20 flex justify-between items-center gap-3">
              <div>
                {isEditing.value && (
                  <button
                    type="button"
                    disabled={submitting.value}
                    onClick={handleDelete}
                    class="px-4 py-2 text-sm font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                )}
              </div>
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    isOpen.value = false;
                    editingId.value = null;
                  }}
                  class="px-6 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={submitting.value}
                  onClick={(e) => handleSubmit(e)}
                  class={`px-8 py-2 text-sm font-semibold rounded-custom transition-all shadow-lg active:scale-95 disabled:opacity-50 ${
                    isPago
                      ? "bg-indigo-500 hover:bg-indigo-400 text-white"
                      : "bg-primary hover:bg-primary-light text-white"
                  }`}
                >
                  {submitting.value ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
