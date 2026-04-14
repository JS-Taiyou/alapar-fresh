import { query } from "./db.ts";
import type { Transaction } from "./types.ts";

interface RegistryCache {
  transactions: Transaction[];
  spawnCandidates: Transaction[];
  lastModified: string | null;
  cachedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, RegistryCache>();

export function invalidateRegistry(registryId: string): void {
  cache.delete(registryId);
}

export function clearAll(): void {
  cache.clear();
}

export async function getStamp(registryId: string): Promise<string | null> {
  const result = await query(
    "SELECT last_modified FROM registries WHERE id = $1",
    [registryId],
  );
  if (result.rows.length === 0) return null;
  const lm = result.rows[0].last_modified;
  return lm ? new Date(lm as string).toISOString() : null;
}

export async function getCachedTransactions(
  registryId: string,
  fetcher: () => Promise<Transaction[]>,
): Promise<{ transactions: Transaction[]; hit: boolean }> {
  const stamp = await getStamp(registryId);
  const entry = cache.get(registryId);

  if (entry && entry.lastModified === stamp && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
    return { transactions: entry.transactions, hit: true };
  }

  const transactions = await fetcher();
  cache.set(registryId, {
    transactions,
    spawnCandidates: [],
    lastModified: stamp,
    cachedAt: Date.now(),
  });
  return { transactions, hit: false };
}

export async function getCachedSpawnCandidates(
  registryId: string,
  fetcher: () => Promise<Transaction[]>,
): Promise<Transaction[]> {
  const stamp = await getStamp(registryId);
  const entry = cache.get(registryId);

  if (
    entry && entry.spawnCandidates.length > 0 &&
    entry.lastModified === stamp && Date.now() - entry.cachedAt < CACHE_TTL_MS
  ) {
    return entry.spawnCandidates;
  }

  const candidates = await fetcher();

  if (entry && entry.lastModified === stamp) {
    entry.spawnCandidates = candidates;
  } else {
    cache.set(registryId, {
      transactions: [],
      spawnCandidates: candidates,
      lastModified: stamp,
      cachedAt: Date.now(),
    });
  }

  return candidates;
}
