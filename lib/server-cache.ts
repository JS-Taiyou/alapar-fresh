import { query } from "./db.ts";
import type { Transaction } from "./types.ts";

interface RegistryCache {
  transactions: Transaction[];
  spawnCandidates: Transaction[];
  transactionCounts: Map<string, number> | null;
  lastModified: string | null;
  cachedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new Map<string, RegistryCache>();
const userActiveRegistries = new Map<string, string>();

function evictIfNeeded(): void {
  if (cache.size < MAX_ENTRIES) return;
  const now = Date.now();
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      cache.delete(key);
      if (cache.size < MAX_ENTRIES) return;
    }
    if (entry.cachedAt < oldestTime) {
      oldestTime = entry.cachedAt;
      oldestKey = key;
    }
  }
  if (oldestKey && cache.size >= MAX_ENTRIES) {
    cache.delete(oldestKey);
  }
}

export function invalidateRegistry(registryId: string): void {
  cache.delete(registryId);
  query(
    "UPDATE registries SET last_modified = NOW() WHERE id = $1",
    [registryId],
  ).catch(() => {});
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

  if (
    entry && entry.lastModified === stamp &&
    Date.now() - entry.cachedAt < CACHE_TTL_MS
  ) {
    return { transactions: entry.transactions, hit: true };
  }

  const transactions = await fetcher();
  evictIfNeeded();
  cache.set(registryId, {
    transactions,
    spawnCandidates: [],
    transactionCounts: null,
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
    evictIfNeeded();
    cache.set(registryId, {
      transactions: [],
      spawnCandidates: candidates,
      transactionCounts: null,
      lastModified: stamp,
      cachedAt: Date.now(),
    });
  }

  return candidates;
}

export function getCachedTransactionCounts(
  registryIds: string[],
): { counts: Map<string, number>; hit: boolean } {
  const now = Date.now();
  for (const id of registryIds) {
    const entry = cache.get(id);
    if (
      !entry || !entry.transactionCounts || now - entry.cachedAt >= CACHE_TTL_MS
    ) {
      return { counts: new Map(), hit: false };
    }
  }

  const counts = new Map<string, number>();
  for (const id of registryIds) {
    const entry = cache.get(id);
    if (entry?.transactionCounts) {
      for (const [rid, cnt] of entry.transactionCounts) {
        counts.set(rid, cnt);
      }
    }
  }
  return { counts, hit: true };
}

export function setCachedTransactionCounts(
  counts: Map<string, number>,
): void {
  for (const [registryId] of counts) {
    const entry = cache.get(registryId);
    if (entry) {
      entry.transactionCounts = counts;
    }
  }
}

export function getUserActiveRegistry(userId: string): string | null {
  return userActiveRegistries.get(userId) ?? null;
}

export function setUserActiveRegistry(
  userId: string,
  registryId: string,
): void {
  userActiveRegistries.set(userId, registryId);
}
