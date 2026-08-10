/**
 * Pure invitation + spawn-candidate logic.
 *
 * Extracted from `lib/store.ts` so it can be unit-tested without a database.
 *
 * - {@link generateInviteCode} produces an 8-character code from an
 *   unambiguous alphabet (no `0`, `O`, `1`, `I`) to avoid human transcription
 *   errors.
 * - {@link filterSpawnCandidates} implements the carry-forward eligibility
 *   rules: for each recurring group (deduped to the latest member), a
 *   `recurrente` is a candidate only if it has been archived into an exercise,
 *   and a `parcialidad` is a candidate only if it isn't fully paid off. Any
 *   group with a disabled member is excluded entirely.
 */
import type { Transaction } from "./types.ts";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate an 8-character invite code from the unambiguous alphabet. */
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

/** The invite-code alphabet, exposed for tests/inspection. */
export const INVITE_ALPHABET_CHARS = INVITE_ALPHABET;

/**
 * Given the full set of recurring/parcialidad transactions for a registry,
 * return the subset eligible for carry-forward cloning.
 *
 * Rules:
 *   - Group by `recurringGroupId`; keep only the latest member per group.
 *   - If ANY member of a group has `recurringDisabled`, the whole group is
 *     excluded.
 *   - `recurrente` is a candidate only when `exerciseId !== null` (already
 *     archived by a cut).
 *   - `parcialidad` is a candidate only when `installmentCurrent` and
 *     `installmentTotal` are both non-null and `current < total`.
 */
export function filterSpawnCandidates(
  transactions: Transaction[],
): Transaction[] {
  const disabledGroups = new Set<string>();
  for (const t of transactions) {
    if (t.recurringDisabled) disabledGroups.add(t.recurringGroupId);
  }

  const latestPerGroup = new Map<string, Transaction>();
  for (const t of transactions) {
    const existing = latestPerGroup.get(t.recurringGroupId);
    if (!existing || t.createdAt > existing.createdAt) {
      latestPerGroup.set(t.recurringGroupId, t);
    }
  }

  const candidates: Transaction[] = [];
  for (const t of latestPerGroup.values()) {
    if (disabledGroups.has(t.recurringGroupId)) continue;
    if (t.type === "recurrente") {
      if (t.exerciseId !== null) candidates.push(t);
    } else if (t.type === "parcialidad") {
      if (
        t.installmentCurrent !== null && t.installmentTotal !== null &&
        t.installmentCurrent < t.installmentTotal
      ) {
        candidates.push(t);
      }
    }
  }
  return candidates;
}
