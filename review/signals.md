# Signals Review

## Signal Creation and Passing

**Doc reference**: Signals from `@preact/signals` can be passed as `Signal<T>`
props to islands for cross-island reactivity.

**Current implementation**: Signals created in route components
(`routes/dashboard/index.tsx`) and passed to multiple islands. Shared signal
references enable cross-island updates.

**Issues**: None — pattern is correct.

## useSignalEffect Cleanup

**Current implementation**: Cleanup functions in `useSignalEffect` are correct —
`unsubscribeAll()` called on cleanup for realtime subscriptions.

**Severity**: N/A — correct

## Wake-up Detection

**Current implementation**: `document.addEventListener("visibilitychange", ...)`
detects tab wake-up. Compares stamp via `/api/stamp/{rid}` to detect stale data.
Resubscribes to realtime if needed.

**Severity**: N/A — correct implementation
