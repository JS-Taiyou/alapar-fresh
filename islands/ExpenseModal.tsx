import { useSignal } from "@preact/signals";
import type {
  DefaultSplit,
  SplitEntry,
  TransactionSplit,
  User,
} from "../lib/types.ts";

interface ExpenseModalProps {
  users: User[];
  currentUserId: string;
  registryId: string;
  defaultSplit: DefaultSplit | null;
}

type SplitMode = "auto" | "percentage" | "fixed";
type ExpenseType = "unico" | "parcialidad" | "recurrente";

export default function ExpenseModal(props: ExpenseModalProps) {
  const isOpen = useSignal(false);
  const submitting = useSignal(false);
  const amount = useSignal(0);
  const description = useSignal("");
  const notes = useSignal("");
  const expenseType = useSignal<ExpenseType>("unico");
  const installmentCurrent = useSignal(1);
  const installmentTotal = useSignal(12);
  const splitMode = useSignal<SplitMode>("auto");
  const userPaid = useSignal(props.currentUserId);
  const percentages = useSignal<Record<string, number>>(
    Object.fromEntries(
      props.users.map((
        u,
      ) => [u.id, Math.round(10000 / props.users.length) / 100]),
    ),
  );
  const fixedAmounts = useSignal<Record<string, number>>(
    Object.fromEntries(props.users.map((u) => [u.id, 0])),
  );

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

  function openModal() {
    amount.value = 0;
    description.value = "";
    notes.value = "";
    expenseType.value = "unico";
    installmentCurrent.value = 1;
    installmentTotal.value = 12;
    userPaid.value = props.currentUserId;
    if (
      props.defaultSplit &&
      props.defaultSplit.splits.length === props.users.length
    ) {
      splitMode.value = "percentage";
      const userIds = new Set(props.users.map((u) => u.id));
      const allPresent = props.defaultSplit.splits.every((s) =>
        userIds.has(s.userId)
      );
      if (allPresent) {
        percentages.value = Object.fromEntries(
          props.defaultSplit.splits.map((s) => [s.userId, s.percentage]),
        );
      } else {
        splitMode.value = "auto";
        percentages.value = Object.fromEntries(
          props.users.map((
            u,
          ) => [u.id, Math.round(10000 / props.users.length) / 100]),
        );
      }
    } else {
      splitMode.value = "auto";
      percentages.value = Object.fromEntries(
        props.users.map((
          u,
        ) => [u.id, Math.round(10000 / props.users.length) / 100]),
      );
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

  function totalFixed(): number {
    return Object.values(fixedAmounts.value).reduce((s, v) => s + v, 0);
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
    const count = props.users.length;
    percentages.value = Object.fromEntries(
      props.users.map((u) => [u.id, Math.round((100 / count) * 100) / 100]),
    );
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.value) return;
    submitting.value = true;

    const splits = getSplits();
    const splitJson: TransactionSplit = { splits };

    const form = new FormData();
    form.append("description", description.value);
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
      const res = await fetch("/api/transactions", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Create failed");
      isOpen.value = false;
      globalThis.location.reload();
    } catch {
      submitting.value = false;
    }
  }

  const splits = getSplits();
  const totalSplitAmount = splits.reduce((s, sp) => s + sp.amount, 0);
  const totalPct = splitMode.value === "percentage"
    ? totalPercentage()
    : splits.reduce((s, sp) => s + sp.percentage, 0);

  return (
    <>
      <button
        onClick={openModal}
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
            if (e.target === e.currentTarget) isOpen.value = false;
          }}
        >
          <div class="bg-surface border border-border-custom w-full max-w-2xl rounded-custom shadow-2xl flex flex-col overflow-hidden">
            <header class="px-6 py-4 border-b border-border-custom flex justify-between items-center">
              <div>
                <h2 class="text-xl font-bold text-white">Nuevo Gasto</h2>
                <p class="text-sm text-slate-400">
                  Configura cómo se divide este gasto.
                </p>
              </div>
              <button
                onClick={() => isOpen.value = false}
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
                    Monto Total
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
                    Tipo de Gasto
                  </label>
                  <div class="flex gap-2 p-1 bg-background border border-border-custom rounded-custom">
                    {(["unico", "parcialidad", "recurrente"] as ExpenseType[])
                      .map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => expenseType.value = t}
                          class={`flex-1 py-2 text-sm font-medium rounded-custom transition-colors ${
                            expenseType.value === t
                              ? "bg-primary text-white shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {t === "unico"
                            ? "Único"
                            : t === "parcialidad"
                            ? "Parcialidad"
                            : "Recurrente"}
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
                  placeholder="Ej: Supermercado semanal"
                  value={description.value}
                  onInput={(e) =>
                    description.value = (e.target as HTMLInputElement).value}
                  required
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
                      onClick={() => splitMode.value = "percentage"}
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
                  <table class="w-full text-left border-collapse">
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
                        const split = splits.find((s) => s.userId === user.id);
                        const initials = user.name.split(" ").map((n) => n[0])
                          .join("").substring(0, 2).toUpperCase();
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
                                      value={percentages.value[user.id] ?? 0}
                                      onInput={(e) => {
                                        const sanitized = sanitizeDecimal(
                                          (e.target as HTMLInputElement).value,
                                        );
                                        (e.target as HTMLInputElement).value =
                                          sanitized;
                                        const v = parseFloat(sanitized) || 0;
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
                                      value={fixedAmounts.value[user.id] ?? 0}
                                      onInput={(e) => {
                                        const sanitized = sanitizeDecimal(
                                          (e.target as HTMLInputElement).value,
                                        );
                                        (e.target as HTMLInputElement).value =
                                          sanitized;
                                        const v = parseFloat(sanitized) || 0;
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
                </div>
              </section>
            </form>

            <footer class="px-6 py-4 border-t border-border-custom bg-slate-800/20 flex justify-end items-center gap-3">
              <button
                type="button"
                onClick={() => isOpen.value = false}
                class="px-6 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting.value}
                onClick={(e) => handleSubmit(e)}
                class="px-8 py-2 text-sm font-semibold bg-primary hover:bg-primary-light text-white rounded-custom transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {submitting.value ? "Guardando..." : "Guardar"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
