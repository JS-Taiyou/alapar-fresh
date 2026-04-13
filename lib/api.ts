const BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Accept": "application/json",
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (res.status === 304) {
    throw new Error("NOT_MODIFIED");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}

export interface DashboardData {
  transactions: unknown[];
  users: unknown[];
  balance: number;
  balanceEntries: unknown[];
  spawnCandidates: unknown[];
  defaultSplit: unknown;
  entityIds: string[];
}

export async function fetchDashboard(etag?: string): Promise<DashboardData> {
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;
  return request<DashboardData>("/api/dashboard", { headers });
}

export interface TransactionsResponse {
  transactions: unknown[];
}

export async function fetchTransactions(etag?: string): Promise<TransactionsResponse> {
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;
  return request<TransactionsResponse>("/api/transactions", { headers });
}

export async function createTransaction(data: FormData): Promise<unknown> {
  return request<unknown>("/api/transactions", {
    method: "POST",
    body: data,
    headers: undefined,
  });
}

export async function updateTransaction(id: string, data: FormData): Promise<unknown> {
  return request<unknown>(`/api/transactions/${id}`, {
    method: "PUT",
    body: data,
    headers: undefined,
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  return request<void>(`/api/transactions/${id}`, { method: "DELETE" });
}

export async function fetchRegistries(): Promise<{
  registries: unknown[];
  activeRegistryId: string | null;
}> {
  return request("/api/registries");
}

export async function createRegistry(name: string): Promise<{ registry: unknown }> {
  return request<{ registry: unknown }>("/api/registries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function renameRegistry(id: string, name: string): Promise<unknown> {
  return request<unknown>(`/api/registries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function fetchExercises(): Promise<{ exercises: unknown[] }> {
  return request("/api/exercises");
}

export async function createExercise(): Promise<{ exercise: unknown; transactions: unknown[] }> {
  return request("/api/exercises", { method: "POST" });
}

export async function fetchExerciseTransactions(exerciseId: string): Promise<{ transactions: unknown[] }> {
  return request(`/api/exercises/${exerciseId}/transactions`);
}

export async function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}
