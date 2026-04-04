import { useComputed, useSignal } from "@preact/signals";
import type {
  BalanceBreakdownEntry,
  DefaultSplit,
  SplitEntry,
  Transaction,
  TransactionSplit,
  User,
} from "../lib/types.ts";

interface EnrichedTransaction extends Transaction {
  paidByUser: User | null;
}

interface TransactionListProps {
  transactions: EnrichedTransaction[];
  users: User[];
  currentUserId: string;
  registryId: string;
  balanceBreakdown: BalanceBreakdownEntry[];
  defaultSplit: DefaultSplit | null;
}

type SplitMode = "auto" | "percentage" | "fixed";
type TransactionType = "unico" | "parcialidad" | "recurrente" | "pago";

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

function computeDefaultPercentages(
  users: User[],
  defaultSplit: DefaultSplit | null,
): Record<string, number> {
  if (defaultSplit && defaultSplit.splits.length === users.length) {
    const userIds = new Set(users.map((u) => u.id));
    const allPresent = defaultSplit.splits.every((s) => userIds.has(s.userId));
    if (allPresent) {
      return Object.fromEntries(
        defaultSplit.splits.map((s) => [s.userId, s.percentage]),
      );
    }
  }
  return Object.fromEntries(
    users.map((u) => [u.id, Math.round(10000 / users.length) / 100]),
  );
}

function TransactionCardClickable(props: {
  tx: EnrichedTransaction;
  users: User[];
  currentUserId: string;
  onClick: () => void;
}) {
  const { tx, currentUserId } = props;

  if (tx.type === "pago") {
    const isPayer = tx.userPaid === currentUserId;
    const recipientSplit = tx.splitJson.splits[0];
    const recipientUser = recipientSplit
      ? props.users.find((u) => u.id === recipientSplit.userId)
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
              <span class={isPaidByMe ? "text-primary" : "text-slate-400"}>
                {isPaidByMe ? "Tú pagaste" : tx.paidByUser.name}
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
    </button>
  );
}

export default function TransactionList(props: TransactionListProps) {
  const transactions = useSignal<EnrichedTransaction[]>(props.transactions);
  const isOpen = useSignal(false);
  const editingId = useSignal<string | null>(null);
  const submitting = useSignal(false);
  const amount = useSignal(0);
  const description = useSignal("");
  const notes = useSignal("");
  const expenseType = useSignal<TransactionType>("unico");
  const installmentCurrent = useSignal(1);
  const installmentTotal = useSignal(12);
  const splitMode = useSignal<SplitMode>("auto");
  const userPaid = useSignal(props.currentUserId);
  const paymentRecipient = useSignal<string>(
    props.users.find((u) => u.id !== props.currentUserId)?.id ?? "",
  );
  const percentages = useSignal<Record<string, number>>(
    computeDefaultPercentages(props.users, props.defaultSplit),
  );
  const fixedAmounts = useSignal<Record<string, number>>(
    Object.fromEntries(props.users.map((u) => [u.id, 0])),
  );

  const isEditing = useComputed(() => editingId.value !== null);

  function buildDefaultPercentages(): Record<string, number> {
    return computeDefaultPercentages(props.users, props.defaultSplit);
  }

  function resetForm() {
    amount.value = 0;
    description.value = "";
    notes.value = "";
    expenseType.value = "unico";
    installmentCurrent.value = 1;
    installmentTotal.value = 12;
    userPaid.value = props.currentUserId;
    paymentRecipient.value =
      props.users.find((u) => u.id !== props.currentUserId)?.id ?? "";
    if (
      props.defaultSplit &&
      props.defaultSplit.splits.length === props.users.length
    ) {
      splitMode.value = "percentage";
      percentages.value = buildDefaultPercentages();
    } else {
      splitMode.value = "auto";
      percentages.value = buildDefaultPercentages();
    }
    fixedAmounts.value = Object.fromEntries(props.users.map((u) => [u.id, 0]));
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
      const count = props.users.length;
      const perPerson = Math.floor((total / count) * 100) / 100;
      const remainder = Math.round((total - perPerson * count) * 100) / 100;
      return props.users.map((u, i) => ({
        userId: u.id,
        percentage: Math.round((100 / count) * 100) / 100,
        amount: perPerson + (i === 0 ? remainder : 0),
      }));
    }
    if (splitMode.value === "percentage") {
      return props.users.map((u) => ({
        userId: u.id,
        percentage: percentages.value[u.id] ?? 0,
        amount: Math.round(total * (percentages.value[u.id] ?? 0)) / 100,
      }));
    }
    return props.users.map((u) => ({
      userId: u.id,
      percentage: total > 0
        ? Math.round(((fixedAmounts.value[u.id] ?? 0) / total) * 10000) / 100
        : 0,
      amount: fixedAmounts.value[u.id] ?? 0,
    }));
  }

  function totalPercentage(): number {
    return Object.values(percentages.value).reduce((s, v) => s + v, 0);
  }

  function autoComplementPercentage(userId: string) {
    if (props.users.length === 2) {
      const otherId = props.users.find((u) => u.id !== userId)?.id;
      if (otherId) {
        const newPcts = { ...percentages.value };
        newPcts[otherId] = Math.round((100 - (newPcts[userId] ?? 0)) * 100) /
          100;
        percentages.value = newPcts;
      }
    }
  }

  function autoComplementFixed(userId: string) {
    if (props.users.length === 2) {
      const otherId = props.users.find((u) => u.id !== userId)?.id;
      if (otherId) {
        const newAmounts = { ...fixedAmounts.value };
        newAmounts[otherId] = Math.round(
          (Math.abs(amount.value) - (newAmounts[userId] ?? 0)) * 100,
        ) / 100;
        fixedAmounts.value = newAmounts;
      }
    }
  }

  function setAutoSplit() {
    splitMode.value = "auto";
    percentages.value = Object.fromEntries(
      props.users.map((
        u,
      ) => [u.id, Math.round((100 / props.users.length) * 100) / 100]),
    );
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.value) return;
    submitting.value = true;

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

    const form = new FormData();
    form.append("description", description.value || "Pago");
    form.append("amount", amount.value.toString());
    form.append("originalAmount", Math.abs(amount.value).toString());
    form.append("type", expenseType.value);
    form.append("splitJson", JSON.stringify(splitJson));
    form.append("userPaid", userPaid.value);
    form.append("notes", notes.value);
    form.append("registryId", props.registryId);
    if (expenseType.value === "parcialidad") {
      form.append("installmentCurrent", installmentCurrent.value.toString());
      form.append("installmentTotal", installmentTotal.value.toString());
    }

    try {
      if (editingId.value) {
        const res = await fetch(`/api/transactions/${editingId.value}`, {
          method: "PUT",
          body: form,
        });
        if (!res.ok) throw new Error("Update failed");
        const updated = await res.json();
        const paidByUser = props.users.find((u) => u.id === updated.userPaid) ??
          null;
        transactions.value = transactions.value.map((t) =>
          t.id === editingId.value ? { ...updated, paidByUser } : t
        );
      } else {
        const res = await fetch("/api/transactions", {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error("Create failed");
        const created = await res.json();
        const paidByUser = props.users.find((u) => u.id === created.userPaid) ??
          null;
        transactions.value = [
          { ...created, paidByUser },
          ...transactions.value,
        ];
      }
      isOpen.value = false;
      editingId.value = null;
      globalThis.location.reload();
    } catch {
      submitting.value = false;
    }
  }

  function handleDelete() {
    if (!editingId.value || submitting.value) return;
    if (!confirm("Eliminar esta transacción?")) return;
    submitting.value = true;
    const id = editingId.value;
    fetch(`/api/transactions/${id}`, { method: "DELETE" }).then((res) => {
      if (res.ok) {
        transactions.value = transactions.value.filter((t) => t.id !== id);
        isOpen.value = false;
        editingId.value = null;
        globalThis.location.reload();
      } else {
        submitting.value = false;
      }
    }).catch(() => {
      submitting.value = false;
    });
  }

  const splits = getSplits();
  const totalSplitAmount = splits.reduce((s, sp) => s + sp.amount, 0);
  const totalPct = splitMode.value === "percentage"
    ? totalPercentage()
    : splits.reduce((s, sp) => s + sp.percentage, 0);

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
            Transacciones Recientes
          </h2>
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
          : transactions.value.map((tx) => (
            <TransactionCardClickable
              key={tx.id}
              tx={tx}
              users={props.users}
              currentUserId={props.currentUserId}
              onClick={() => openEdit(tx)}
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
            if (e.target === e.currentTarget) {
              isOpen.value = false;
              editingId.value = null;
            }
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
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-2">
                  <label
                    class="block text-sm font-medium text-slate-300"
                    for="total-amount"
                  >
                    {isPago ? "Monto del Pago" : "Monto Total"}
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
                      value={amount.value || ""}
                      onInput={(e) => {
                        const sanitized = sanitizeDecimal(
                          (e.target as HTMLInputElement).value,
                        );
                        (e.target as HTMLInputElement).value = sanitized;
                        amount.value = parseFloat(sanitized) || 0;
                      }}
                      required
                    />
                  </div>
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
                          installmentTotal.value = parseInt(sanitized) || 12;
                        }}
                      />
                      <span class="text-slate-500">meses</span>
                    </div>
                  </div>
                </div>
              )}

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
                            {props.users.length > 2 && (
                              <th class="px-4 py-3 text-xs font-semibold text-slate-400 text-right">
                                SALDO
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border-custom">
                          {props.users.map((user) => {
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
                                      {user.id === props.currentUserId && (
                                        <span class="text-slate-500 ml-1">
                                          (Tú)
                                        </span>
                                      )}
                                      {user.isEntity && (
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
                                          props.users.find((u) =>
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
                                        userPaid.value = props.users.find((u) =>
                                          u.id !== user.id
                                        )?.id ?? props.currentUserId;
                                      }
                                    }}
                                    class="accent-indigo-400"
                                  />
                                </td>
                                {props.users.length > 2 && (
                                  <td class="px-4 py-3 text-right">
                                    {user.id !== props.currentUserId &&
                                      (() => {
                                        const bd = props.balanceBreakdown.find(
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
                        {props.users.map((user) => {
                          const initials = user.name.split(" ").map((n) => n[0])
                            .join("").substring(0, 2).toUpperCase();
                          const bd = props.users.length > 2 &&
                              user.id !== props.currentUserId
                            ? props.balanceBreakdown.find((b) =>
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
                                        props.users.find((u) =>
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
                                      userPaid.value = props.users.find((u) =>
                                        u.id !== user.id
                                      )?.id ?? props.currentUserId;
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
                                    {user.id === props.currentUserId && (
                                      <span class="text-slate-500 ml-1">
                                        (Tú)
                                      </span>
                                    )}
                                    {user.isEntity && (
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
                            if (props.defaultSplit) {
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
                          {props.users.map((user) => {
                            const split = splits.find((s) =>
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
                                      {user.id === props.currentUserId && (
                                        <span class="text-slate-500 ml-1">
                                          (Tú)
                                        </span>
                                      )}
                                      {user.isEntity && (
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
                                            const v = parseFloat(sanitized) ||
                                              0;
                                            percentages.value = {
                                              ...percentages.value,
                                              [user.id]: v,
                                            };
                                            autoComplementPercentage(user.id);
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
                                            const v = parseFloat(sanitized) ||
                                              0;
                                            fixedAmounts.value = {
                                              ...fixedAmounts.value,
                                              [user.id]: v,
                                            };
                                            autoComplementFixed(user.id);
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
                        {props.users.map((user) => {
                          const split = splits.find((s) =>
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
                                    {user.id === props.currentUserId && (
                                      <span class="text-slate-500 ml-1">
                                        (Tú)
                                      </span>
                                    )}
                                    {user.isEntity && (
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
                                            const v = parseFloat(sanitized) ||
                                              0;
                                            percentages.value = {
                                              ...percentages.value,
                                              [user.id]: v,
                                            };
                                            autoComplementPercentage(user.id);
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
                                            const v = parseFloat(sanitized) ||
                                              0;
                                            fixedAmounts.value = {
                                              ...fixedAmounts.value,
                                              [user.id]: v,
                                            };
                                            autoComplementFixed(user.id);
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
