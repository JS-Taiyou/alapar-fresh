import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type {
  BalanceBreakdownEntry,
  DefaultSplit,
} from "../lib/types.ts";
import { computeDefaultPercentages } from "../lib/calculations.ts";
import {
  balanceSignal,
  balanceEntriesSignal,
  usersSignal,
  transactionsSignal,
  recalculateAndBroadcast,
  initializeSignals,
} from "./shared-signals.ts";



interface BalanceBreakdownProps {
  balance: number;
  entries: BalanceBreakdownEntry[];
  usersCount: number;
}

export default function BalanceBreakdown(_props: BalanceBreakdownProps) {
  const showPopover = useSignal(false);

  const balance = balanceSignal.value;
  const entries = balanceEntriesSignal.value;
  const usersCount = usersSignal.value.length;

  const owedToMe = entries.filter((e) => e.amount > 0);
  const owedByMe = entries.filter((e) => e.amount < 0);
  const canShowPopover = usersCount > 2;

  function toggle() {
    if (canShowPopover) showPopover.value = !showPopover.value;
  }

  function close() {
    showPopover.value = false;
  }

  const balanceStr = Math.abs(balance).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div class="relative">
      <button
        type="button"
        onClick={toggle}
        class={`text-left ${
          canShowPopover ? "cursor-pointer group" : "cursor-default"
        }`}
      >
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Balance Total
          </span>
          {canShowPopover && (
            <svg
              class={`w-4 h-4 transition-all duration-200 ${
                showPopover.value
                  ? "text-primary rotate-180"
                  : "text-gray-600 group-hover:text-gray-400"
              }`}
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
          )}
        </div>
        <p
          class={`text-4xl font-bold mt-1 ${
            balance >= 0 ? "text-green-500" : "text-red-500"
          }`}
        >
          ${balanceStr}
        </p>
      </button>

      {showPopover.value && (
        <>
          <div
            class="fixed inset-0 z-40"
            onClick={close}
          />
          <div class="absolute top-full left-0 mt-3 z-50 w-80 bg-surface border border-border-custom rounded-custom shadow-2xl overflow-hidden animate-fade-in">
            <div class="px-4 py-3 border-b border-border-custom bg-slate-800/30">
              <h3 class="text-sm font-semibold text-white">
                Desglose por persona
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                Detalle de saldos con cada miembro
              </p>
            </div>

            {entries.length === 0
              ? (
                <div class="px-4 py-6 text-center">
                  <svg
                    class="w-8 h-8 text-emerald-500 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                  <p class="text-sm text-slate-400">
                    Todos est&aacute;n balanceados
                  </p>
                </div>
              )
              : (
                <div>
                  {owedToMe.length > 0 && (
                    <div class="px-4 py-3 space-y-2.5">
                      <h4 class="text-xs font-semibold uppercase tracking-wider text-green-400/80">
                        Te deben
                      </h4>
                      {owedToMe.map((entry) => {
                        const initials = entry.userName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)
                          .toUpperCase();
                        return (
                          <div
                            key={entry.userId}
                            class="flex items-center justify-between"
                          >
                            <div class="flex items-center gap-2.5">
                              <div
                                class="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                style={`background-color: ${entry.userColor}25; color: ${entry.userColor}`}
                              >
                                {initials}
                              </div>
                              <span class="text-sm text-slate-300">
                                {entry.userName}
                              </span>
                            </div>
                            <span class="text-sm font-semibold text-green-400">
                              +$
                              {entry.amount.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {owedToMe.length > 0 && owedByMe.length > 0 && (
                    <div class="border-t border-border-custom" />
                  )}

                  {owedByMe.length > 0 && (
                    <div class="px-4 py-3 space-y-2.5">
                      <h4 class="text-xs font-semibold uppercase tracking-wider text-red-400/80">
                        Debes
                      </h4>
                      {owedByMe.map((entry) => {
                        const initials = entry.userName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)
                          .toUpperCase();
                        return (
                          <div
                            key={entry.userId}
                            class="flex items-center justify-between"
                          >
                            <div class="flex items-center gap-2.5">
                              <div
                                class="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                style={`background-color: ${entry.userColor}25; color: ${entry.userColor}`}
                              >
                                {initials}
                              </div>
                              <span class="text-sm text-slate-300">
                                {entry.userName}
                              </span>
                            </div>
                            <span class="text-sm font-semibold text-red-400">
                              -$
                              {Math.abs(entry.amount).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
          </div>
        </>
      )}
    </div>
  );
}
