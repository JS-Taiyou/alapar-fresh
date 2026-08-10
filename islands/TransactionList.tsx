import {
  type Signal,
  useComputed,
  useSignal,
  useSignalEffect,
} from "@preact/signals";
import type {
  BalanceBreakdownEntry,
  DefaultSplit,
  Participant,
  TransactionPayment,
} from "../lib/types.ts";
import { type EnrichedTransaction } from "./shared-signals.ts";
import { rowToEnrichedTransaction } from "../lib/rows.ts";

function dedupById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
import {
  calculateBalance,
  calculatePairwiseBreakdown,
} from "../lib/calculations.ts";
import {
  resubscribe,
  setupRealtimeConfig,
  subscribeToRegistry,
  unsubscribeAll,
} from "../lib/realtime.ts";
import {
  requestNotificationPermission,
  subscribeToPush,
} from "../lib/notifications.ts";
import { cache } from "../lib/cache.ts";
import TransactionModal from "../components/TransactionModal.tsx";

let lastPushSubscribedRegistry: string | null = null;

interface SpawnCandidate {
  id: string;
  description: string;
  type: "parcialidad" | "recurrente";
  originalAmount: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

interface TransactionListProps {
  transactions: Signal<EnrichedTransaction[]>;
  users: Signal<Participant[]>;
  currentUserId: Signal<string>;
  registryId: Signal<string>;
  balance: Signal<number>;
  balanceEntries: Signal<BalanceBreakdownEntry[]>;
  defaultSplit: Signal<DefaultSplit | null>;
  spawnCandidates: Signal<SpawnCandidate[]>;
  lastModified: Signal<string | null>;
  entityIds: Signal<Set<string>>;
  entities: Signal<{ id: string; name: string; color: string }[]>;
  transactionPayments: Signal<TransactionPayment[]>;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  accessToken?: string;
  isDemo?: boolean;
}

function TransactionCardClickable(props: {
  tx: EnrichedTransaction;
  users: Participant[];
  currentUserId: string;
  onClick: () => void;
  allTxs?: EnrichedTransaction[];
  transactionPayments?: TransactionPayment[];
}) {
  const { tx, users, currentUserId } = props;
  const tpList = props.transactionPayments ?? [];

  if (tx.type === "ajuste") {
    const formattedAmount = tx.originalAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return (
      <div class="w-full text-left bg-card p-5 rounded-custom border-l-4 border-l-amber-500 border border-white/5 flex justify-between items-center">
        <div class="flex flex-col min-w-0">
          <span class="text-lg font-semibold text-white flex items-center gap-2 truncate">
            {tx.description}
            <span class="text-xs font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
              Saldo pendiente
            </span>
          </span>
          <span class="text-sm text-zinc-400">
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

    const linkedExpenseIds = tpList
      .filter((tp) => tp.pagoId === tx.id)
      .map((tp) => tp.expenseId);
    const linkedExpenses = linkedExpenseIds.length > 0
      ? (props.allTxs ?? []).filter((t) => linkedExpenseIds.includes(t.id))
      : (tx.relatedTransactionId
        ? (props.allTxs ?? []).filter((t) => t.id === tx.relatedTransactionId)
        : []);

    return (
      <div class="w-full">
        <button
          type="button"
          onClick={props.onClick}
          class={`w-full text-left bg-card p-5 border-l-4 border-l-indigo-500 border border-white/5 flex justify-between items-center transition-transform active:scale-[0.98] hover:bg-white/2 ${
            linkedExpenses.length === 0 ? "rounded-custom" : "rounded-t-custom"
          }`}
        >
          <div class="flex flex-col min-w-0">
            <span class="text-lg font-semibold text-white flex items-center gap-2 truncate">
              {tx.description}
              <span class="text-xs font-medium px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">
                Pago
              </span>
            </span>
            <span class="text-sm text-zinc-400">
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
        {linkedExpenses.length > 0 &&
          linkedExpenses.map((relatedTx, idx) => (
            <button
              key={relatedTx.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const el = document.getElementById(`tx-${relatedTx.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  setTimeout(() => {
                    el.classList.remove("highlight-pulse");
                    void el.offsetWidth;
                    el.classList.add("highlight-pulse");
                    el.addEventListener("animationend", () => {
                      el.classList.remove("highlight-pulse");
                    }, { once: true });
                  }, 450);
                }
              }}
              class={`w-full text-left bg-slate-800/60 px-5 py-2.5 border-l-4 border-l-indigo-500/40 border border-t-0 border-white/5 flex items-center gap-3 hover:bg-slate-700/60 transition-colors ${
                idx === linkedExpenses.length - 1 ? "rounded-b-custom" : ""
              }`}
            >
              <svg
                class="w-3.5 h-3.5 text-slate-500 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
                <path
                  d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-zinc-300 truncate">
                  {relatedTx.description}
                </p>
                <p class="text-[10px] text-zinc-400">
                  {new Date(relatedTx.createdAt).toLocaleDateString("es-MX", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <svg
                class="w-3 h-3 text-slate-500 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M19 9l-7 7-7-7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </button>
          ))}
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

  const linkedPaymentTps = tpList.filter((tp) => tp.expenseId === tx.id);
  const linkedPaymentIds = new Set(linkedPaymentTps.map((tp) => tp.pagoId));
  const linkedPayments = (props.allTxs ?? []).filter(
    (t) =>
      linkedPaymentIds.has(t.id) ||
      (t.type === "pago" && t.relatedTransactionId === tx.id),
  );

  let paymentsAffectingMe = 0;
  if (!isPaidByMe && personalBalance < 0) {
    paymentsAffectingMe = linkedPaymentTps
      .filter((tp) => {
        const pagoTx = (props.allTxs ?? []).find((t) => t.id === tp.pagoId);
        return pagoTx?.userPaid === currentUserId;
      })
      .reduce((sum, tp) => sum + tp.amount, 0);
    if (paymentsAffectingMe === 0) {
      paymentsAffectingMe = linkedPayments
        .filter((p) => p.userPaid === currentUserId)
        .reduce((sum, p) => sum + p.originalAmount, 0);
    }
  } else if (isPaidByMe && personalBalance > 0) {
    paymentsAffectingMe = linkedPaymentTps
      .filter((tp) => {
        const pagoTx = (props.allTxs ?? []).find((t) => t.id === tp.pagoId);
        return pagoTx?.splitJson?.splits?.[0]?.userId === currentUserId;
      })
      .reduce((sum, tp) => sum + tp.amount, 0);
    if (paymentsAffectingMe === 0) {
      paymentsAffectingMe = linkedPayments
        .filter((p) => p.splitJson.splits[0]?.userId === currentUserId)
        .reduce((sum, p) => sum + p.originalAmount, 0);
    }
  }

  const remainingBalance = isPaidByMe
    ? Math.max(0, personalBalance - paymentsAffectingMe)
    : -Math.max(0, Math.abs(personalBalance) - paymentsAffectingMe);

  const isZero = Math.abs(remainingBalance) < 0.005;
  const isPositive = remainingBalance >= 0;

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="w-full text-left bg-card p-5 rounded-custom border border-white/5 flex justify-between items-center transition-transform active:scale-[0.98] hover:bg-white/2"
    >
      <div class="flex flex-col min-w-0">
        <span class="text-lg font-semibold text-white truncate">
          {tx.description}
        </span>
        <div class="text-sm text-zinc-400">
          <span class="block sm:inline">
            {new Date(tx.createdAt).toLocaleDateString("es-MX", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })} &bull; {new Date(tx.createdAt).toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {tx.paidByUser && (
            <>
              <span class="hidden sm:inline">
                {" • "}
                <span
                  class={`text-xs px-1.5 py-0.5 rounded ${
                    isPaidByMe
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-slate-300 text-slate-800 font-bold"
                  }`}
                >
                  {isPaidByMe ? "Tú pagaste" : tx.paidByUser.name}
                </span>
              </span>
              <span
                class={`block sm:hidden text-xs px-1.5 py-0.5 rounded mt-0.5 w-fit ${
                  isPaidByMe
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-slate-300 text-slate-800 font-bold"
                }`}
              >
                {isPaidByMe ? "Tú pagaste" : tx.paidByUser.name}
              </span>
            </>
          )}
          {tx.type === "parcialidad" && tx.installmentCurrent &&
            tx.installmentTotal && (
            <>
              {" • "}
              <span class="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">
                {tx.installmentCurrent}/{tx.installmentTotal}
              </span>
            </>
          )}
        </div>
      </div>
      <div class="text-right flex flex-col items-end">
        <span
          class={`text-xl font-bold ${
            isZero
              ? "text-green-500"
              : isPositive
              ? "text-green-500"
              : "text-red-500"
          }`}
        >
          {isZero ? "" : isPositive ? "+" : "-"}${Math.abs(remainingBalance)
            .toLocaleString(
              "en-US",
              { minimumFractionDigits: 2, maximumFractionDigits: 2 },
            )}
        </span>
        <span class="text-xs text-zinc-400">
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
  const showTerceroPopover = useSignal(false);

  const isOpen = useSignal(false);
  const editingId = useSignal<string | null>(null);
  const modalMode = useSignal<"expense" | "payment">("expense");
  const searchQuery = useSignal("");
  const filterUserId = useSignal<string | null>(null);
  const transactionPayments = props.transactionPayments;

  useSignalEffect(() => {
    const rid = registryId.value;
    if (
      !rid || !props.supabaseUrl || !props.supabaseAnonKey || !props.accessToken
    ) return;

    setupRealtimeConfig(props.supabaseUrl, props.supabaseAnonKey);

    let lastNotificationAt = 0;
    const NOTIFICATION_COOLDOWN = 15_000;

    subscribeToRegistry(
      rid,
      (payload) => {
        const participantMap = new Map(users.value.map((u) => [u.id, u]));

        const mapRow = (row: Record<string, unknown>): EnrichedTransaction =>
          rowToEnrichedTransaction(row, participantMap);

        if (payload.eventType === "INSERT" && payload.new?.id) {
          const existing = transactions.value.find((t) =>
            t.id === payload.new.id
          );
          if (!existing) {
            const creator = payload.new.creator_id as string;
            const desc = payload.new.description as string;
            const amt = typeof payload.new.amount === "string"
              ? parseFloat(payload.new.amount)
              : (payload.new.amount as number);
            const type = payload.new.type as string;

            if (creator === currentUserId.value) {
              const optimisticIndex = transactions.value.findIndex((t) =>
                t.creatorId === creator &&
                t.description === desc &&
                t.amount === amt &&
                t.type === type &&
                t.id !== payload.new.id
              );
              if (optimisticIndex !== -1) {
                const updated = [...transactions.value];
                updated[optimisticIndex] = mapRow(payload.new);
                transactions.value = updated;
              } else {
                transactions.value = [
                  mapRow(payload.new),
                  ...transactions.value,
                ];
              }
            } else {
              transactions.value = [mapRow(payload.new), ...transactions.value];
            }
            if (creator !== currentUserId.value) {
              const now = Date.now();
              if (
                now - lastNotificationAt >= NOTIFICATION_COOLDOWN &&
                Notification.permission === "granted"
              ) {
                lastNotificationAt = now;
                const desc = (payload.new.description as string) ??
                  "Nueva transacción";
                const amt = typeof payload.new.amount === "number"
                  ? payload.new.amount
                  : 0;
                new Notification("Nueva transacción", {
                  body: `${desc} — $${
                    amt.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  }`,
                  icon: "/logo.svg",
                });
              }
            }
          }
        } else if (payload.eventType === "DELETE" && payload.old?.id) {
          transactions.value = transactions.value.filter((t) =>
            t.id !== payload.old.id
          );
        } else if (payload.eventType === "UPDATE" && payload.new?.id) {
          transactions.value = transactions.value.map((t) =>
            t.id === payload.new.id ? mapRow(payload.new) : t
          );
        }
        const allParticipants = dedupById([
          ...users.value.map((u) => ({
            id: u.id,
            name: u.name,
            color: u.color,
          })),
          ...props.entities.value.map((e) => ({
            id: e.id,
            name: e.name,
            color: e.color,
          })),
        ]);
        balance.value = calculateBalance(
          transactions.value as Parameters<typeof calculateBalance>[0],
          currentUserId.value,
        );
        balanceEntries.value = calculatePairwiseBreakdown(
          transactions.value as Parameters<
            typeof calculatePairwiseBreakdown
          >[0],
          currentUserId.value,
          allParticipants,
        );
      },
      props.accessToken,
    );

    requestNotificationPermission().then((granted) => {
      if (granted && rid !== lastPushSubscribedRegistry) {
        lastPushSubscribedRegistry = rid;
        subscribeToPush(rid);
      }
    });

    return () => unsubscribeAll();
  });

  useSignalEffect(() => {
    const rid = registryId.value;
    const txs = transactions.value;
    const bal = balance.value;
    const be = balanceEntries.value;
    const usrs = users.value;
    const uid = currentUserId.value;
    const ds = defaultSplit.value;
    const sc = props.spawnCandidates.value;
    const lm = props.lastModified.value;
    const eids = [...props.entityIds.value];
    const ents = props.entities.value;
    const tps = transactionPayments.value;
    if (!rid || txs.length === 0 && lm === null) return;
    if (props.isDemo) return;
    cache.setRegistrySnapshot({
      registryId: rid,
      transactions: txs.map((t) => ({
        ...t,
        createdAt: typeof t.createdAt === "string"
          ? t.createdAt
          : t.createdAt.toISOString(),
      })),
      transactionPayments: tps,
      balance: bal,
      balanceEntries: be,
      users: usrs,
      currentUserId: uid,
      defaultSplit: ds,
      spawnCandidates: sc,
      entityIds: eids,
      entities: ents,
      lastModified: lm,
    });
  });

  useSignalEffect(() => {
    function onRegistrySwitch(e: Event) {
      const detail = (e as CustomEvent).detail as {
        registryId: string;
        transactions?: EnrichedTransaction[];
        transactionPayments?: TransactionPayment[];
        balance?: number;
        balanceEntries?: BalanceBreakdownEntry[];
        users?: Participant[];
        currentUserId?: string;
        defaultSplit?: DefaultSplit | null;
        spawnCandidates?: SpawnCandidate[];
        lastModified?: string | null;
        entityIds?: string[];
        entities?: { id: string; name: string; color: string }[];
      };
      if (!detail) return;
      registryId.value = detail.registryId;
      if (detail.transactions) {
        transactions.value = detail.transactions.map((t) => ({
          ...t,
          createdAt:
            typeof (t as unknown as { createdAt: unknown }).createdAt ===
                "string"
              ? new Date((t as unknown as { createdAt: string }).createdAt)
              : t.createdAt,
        })) as EnrichedTransaction[];
      }
      if (detail.balance !== undefined) balance.value = detail.balance;
      if (detail.balanceEntries) balanceEntries.value = detail.balanceEntries;
      if (detail.users) users.value = detail.users;
      if (detail.currentUserId) currentUserId.value = detail.currentUserId;
      if (detail.defaultSplit !== undefined) {
        defaultSplit.value = detail.defaultSplit;
      }
      if (detail.spawnCandidates !== undefined) {
        props.spawnCandidates.value = detail.spawnCandidates;
      }
      if (detail.lastModified !== undefined) {
        props.lastModified.value = detail.lastModified;
      }
      if (detail.entityIds) {
        props.entityIds.value = new Set(detail.entityIds);
      }
      if (detail.entities) {
        props.entities.value = detail.entities;
      }
      if (detail.transactionPayments) {
        transactionPayments.value = detail.transactionPayments;
      }
    }
    globalThis.addEventListener("registry-switch", onRegistrySwitch);

    async function onEntitiesChanged(e: Event) {
      const detail = (e as CustomEvent).detail as {
        entities?: { id: string; name: string; color: string }[];
      } | undefined;
      if (detail?.entities) {
        props.entityIds.value = new Set(detail.entities.map((ent) => ent.id));
        return;
      }
      const rid = registryId.value;
      if (!rid) return;
      if (props.isDemo) return;
      try {
        const res = await fetch(`/api/entities?registryId=${rid}`);
        if (rid !== registryId.value) return;
        if (!res.ok) return;
        const data = await res.json() as { id: string }[];
        if (rid !== registryId.value) return;
        props.entityIds.value = new Set(data.map((ent) => ent.id));
      } catch {
        // ignore
      }
    }
    globalThis.addEventListener("entities-changed", onEntitiesChanged);

    return () => {
      globalThis.removeEventListener("registry-switch", onRegistrySwitch);
      globalThis.removeEventListener("entities-changed", onEntitiesChanged);
    };
  });

  useSignalEffect(() => {
    let lastActive = Date.now();
    const FRESHNESS_MS = 30_000;
    const HEARTBEAT_MS = 10_000;

    function wentToSleep() {
      lastActive = Date.now();
    }

    async function wokeUp() {
      if (props.isDemo) return;
      const rid = registryId.value;
      if (!rid) return;
      const elapsed = Date.now() - lastActive;
      if (elapsed < FRESHNESS_MS) return;

      resubscribe().catch(() => {});

      try {
        const stampRes = await fetch(`/api/stamp/${rid}`);
        if (rid !== registryId.value) return;
        if (!stampRes.ok) return;
        const { lastModified } = await stampRes.json() as {
          lastModified: string | null;
        };
        const cached = await cache.getRegistrySnapshot(rid);
        if (rid !== registryId.value) return;
        if (cached?.lastModified === lastModified) return;

        const dashRes = await fetch(`/api/dashboard?registryId=${rid}`);
        if (rid !== registryId.value) return;
        if (!dashRes.ok) return;
        const data = await dashRes.json() as {
          transactions: unknown[];
          transactionPayments: TransactionPayment[];
          balance: number;
          balanceEntries: BalanceBreakdownEntry[];
          users: Participant[];
          defaultSplit: DefaultSplit | null;
          spawnCandidates: SpawnCandidate[];
          entityIds: string[];
          entities: { id: string; name: string; color: string }[];
        };

        transactions.value = (data.transactions as EnrichedTransaction[]).map((
          t,
        ) => ({
          ...t,
          createdAt:
            typeof (t as unknown as { createdAt: unknown }).createdAt ===
                "string"
              ? new Date((t as unknown as { createdAt: string }).createdAt)
              : t.createdAt,
        }));
        balance.value = data.balance;
        balanceEntries.value = data.balanceEntries;
        if (data.defaultSplit !== undefined) {
          defaultSplit.value = data.defaultSplit;
        }
        if (data.spawnCandidates) {
          props.spawnCandidates.value = data.spawnCandidates;
        }
        if (data.users) {
          users.value = data.users;
        }
        if (data.entityIds) {
          props.entityIds.value = new Set(data.entityIds);
        }
        if (data.entities) {
          props.entities.value = data.entities;
        }
        if (data.transactionPayments) {
          transactionPayments.value = data.transactionPayments;
        }
        props.lastModified.value = lastModified;
      } catch { /* wake-up refresh failure non-critical */ }
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") wentToSleep();
      else wokeUp();
    }

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("resume", wokeUp);
    globalThis.addEventListener("pageshow", wokeUp);

    let lastTick = Date.now();
    const heartbeat = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTick;
      lastTick = now;
      if (gap > HEARTBEAT_MS + FRESHNESS_MS) {
        lastActive = 0;
        wokeUp();
      }
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("resume", wokeUp);
      globalThis.removeEventListener("pageshow", wokeUp);
    };
  });

  const filteredTransactions = useComputed(() => {
    let list = transactions.value;
    if (filterUserId.value) {
      list = list.filter((tx) => tx.userPaid === filterUserId.value);
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      list = list.filter((tx) => tx.description.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const da = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const db = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      if (db !== da) return db - da;
      return a.description.localeCompare(b.description);
    });
  });

  if (users.value.length <= 1) {
    return (
      <main class="flex-1 overflow-y-auto custom-scrollbar p-6 flex items-center justify-center">
        <div class="text-center max-w-sm space-y-6">
          <div class="bg-white/5 p-6 rounded-full mx-auto w-fit">
            <svg
              class="h-16 w-16 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
              />
            </svg>
          </div>
          <h3 class="text-2xl font-bold text-white">
            Está muy solo aquí
          </h3>
          <p class="text-zinc-400 text-base leading-relaxed">
            Asegúrate de invitar otros usuarios o crear un{" "}
            <span
              class="font-bold underline cursor-pointer text-orange-400 relative"
              onClick={() =>
                showTerceroPopover.value = !showTerceroPopover.value}
              onMouseEnter={() => showTerceroPopover.value = true}
              onMouseLeave={() => showTerceroPopover.value = false}
            >
              tercero
              {showTerceroPopover.value && (
                <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-surface border border-white/10 text-white text-xs font-normal no-underline rounded-custom px-3 py-2 shadow-xl z-50">
                  Un tercero es una entidad diferente de ti pero que no se va a
                  registrar como usuario, por ejemplo: un banco!
                </span>
              )}
            </span>
          </p>
        </div>
      </main>
    );
  }

  function recalculate() {
    const allParticipants = dedupById([
      ...users.value.map((u) => ({
        id: u.id,
        name: u.name,
        color: u.color,
      })),
      ...props.entities.value.map((e) => ({
        id: e.id,
        name: e.name,
        color: e.color,
      })),
    ]);
    balance.value = calculateBalance(transactions.value, currentUserId.value);
    balanceEntries.value = calculatePairwiseBreakdown(
      transactions.value,
      currentUserId.value,
      allParticipants,
    );
  }

  function openNew() {
    modalMode.value = "expense";
    editingId.value = null;
    isOpen.value = true;
  }

  function openNewPago() {
    modalMode.value = "payment";
    editingId.value = null;
    isOpen.value = true;
  }

  function openEdit(tx: EnrichedTransaction) {
    editingId.value = tx.id;
    modalMode.value = tx.type === "pago" ? "payment" : "expense";
    isOpen.value = true;
  }

  return (
    <>
      <main class="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-6 space-y-4 relative">
        <div class="flex justify-between items-center mb-2">
          <h2 class="text-lg font-semibold text-zinc-200">
            {filterUserId.value
              ? `Ejercicio actual (pagados por ${
                users.value.find((u) => u.id === filterUserId.value)?.name ??
                  ""
              })`
              : "Ejercicio actual"}
          </h2>
        </div>

        {transactions.value.length > 1 && (
          <div class="space-y-3">
            {new Set(transactions.value.map((tx) => tx.userPaid)).size > 1 && (
              <div class="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => filterUserId.value = null}
                  class={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                    filterUserId.value === null
                      ? "bg-primary text-white shadow-sm"
                      : "text-zinc-400 hover:text-white hover:bg-white/5 border border-white/10"
                  }`}
                >
                  Todos
                </button>
                {users.value.map((user) => {
                  const initials = user.name.split(" ").map((n) => n[0]).join(
                    "",
                  )
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
                          : "text-zinc-400 hover:text-white hover:bg-white/5 border border-white/10"
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
            )}
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <svg
                  class="h-5 w-5"
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
              </span>
              <input
                type="text"
                placeholder="Buscar transacción..."
                value={searchQuery.value}
                onInput={(e) =>
                  searchQuery.value = (e.target as HTMLInputElement).value}
                class="w-full bg-surface border-border-custom rounded-custom pl-10 text-white placeholder-zinc-500 focus:ring-primary focus:border-primary py-2.5"
              />
              {searchQuery.value && (
                <button
                  type="button"
                  onClick={() => searchQuery.value = ""}
                  class="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-white"
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
        )}

        <div class="sm:hidden flex gap-2">
          <button
            type="button"
            onClick={openNewPago}
            class="flex-1 py-3 bg-green-700 hover:bg-green-800 text-white font-bold text-base rounded-custom active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            Pago
          </button>
          <button
            type="button"
            onClick={openNew}
            class="flex-1 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-base rounded-custom active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            Gasto
          </button>
        </div>

        {transactions.value.length === 0
          ? (
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
                Sin transacciones
              </h3>
              <p class="text-zinc-400 mt-2">
                Agrega un gasto o un pago
              </p>
            </div>
          )
          : filteredTransactions.value.length === 0
          ? (
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <p class="text-zinc-400">
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
            <div key={tx.id} id={`tx-${tx.id}`}>
              <TransactionCardClickable
                tx={tx}
                users={users.value}
                currentUserId={currentUserId.value}
                onClick={() =>
                  tx.type !== "ajuste" && openEdit(tx)}
                allTxs={transactions.value}
                transactionPayments={transactionPayments.value}
              />
            </div>
          ))}
        <div class="h-12" />
      </main>

      <div class="hidden sm:flex fixed bottom-8 right-8 z-50 flex-col gap-3">
        <div class="group relative">
          <span class="absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap bg-surface text-white text-sm px-3 py-1.5 rounded-custom shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Agregar pago
          </span>
          <button
            type="button"
            onClick={openNewPago}
            class="w-16 h-16 bg-green-700 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all"
          >
            <svg
              class="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </button>
        </div>
        <div class="group relative">
          <span class="absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap bg-surface text-white text-sm px-3 py-1.5 rounded-custom shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Agregar gasto
          </span>
          <button
            type="button"
            onClick={openNew}
            class="w-16 h-16 bg-yellow-500 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all"
          >
            <svg
              class="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </button>
        </div>
      </div>

      <TransactionModal
        isOpen={isOpen}
        editingId={editingId}
        modalMode={modalMode}
        transactions={transactions}
        users={users}
        currentUserId={currentUserId}
        registryId={registryId}
        balanceEntries={balanceEntries}
        defaultSplit={defaultSplit}
        entityIds={props.entityIds}
        entities={props.entities}
        transactionPayments={transactionPayments}
        onRecalculate={recalculate}
        isDemo={props.isDemo}
      />
    </>
  );
}
