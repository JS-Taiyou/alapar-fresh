import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;
let activeChannel: RealtimeChannel | null = null;
let activeRegistryId: string | null = null;

type ChangeHandler = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) => void;

let onChange: ChangeHandler | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = (globalThis as Record<string, unknown>).__SUPABASE_URL__ as string;
    const key = (globalThis as Record<string, unknown>).__SUPABASE_ANON_KEY__ as string;
    if (!url || !key) throw new Error("Supabase config missing");
    supabase = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 2 } },
    });
  }
  return supabase;
}

export async function subscribeToRegistry(registryId: string, handler: ChangeHandler, accessToken?: string): Promise<void> {
  onChange = handler;

  if (activeRegistryId === registryId && activeChannel) return;

  unsubscribeAll();

  activeRegistryId = registryId;
  const client = getSupabase();

  if (accessToken) {
    await client.realtime.setAuth(accessToken);
  }

  activeChannel = client
    .channel(`db-changes-${registryId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "transactions",
        filter: `registry_id=eq.${registryId}`,
      },
      (payload) => {
        if (onChange) {
          onChange({
            eventType: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            new: payload.new as Record<string, unknown>,
            old: payload.old as Record<string, unknown>,
          });
        }
      },
    )
    .subscribe((status, err) => {
      console.log("[realtime] status:", status, err ?? "");
    });
}

export function unsubscribeAll(): void {
  if (activeChannel) {
    const client = getSupabase();
    client.removeChannel(activeChannel);
    activeChannel = null;
    activeRegistryId = null;
  }
}

export function setupRealtimeConfig(supabaseUrl: string, supabaseAnonKey: string): void {
  (globalThis as Record<string, unknown>).__SUPABASE_URL__ = supabaseUrl;
  (globalThis as Record<string, unknown>).__SUPABASE_ANON_KEY__ = supabaseAnonKey;
}
