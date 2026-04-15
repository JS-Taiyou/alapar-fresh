import { useSignal, useSignalEffect } from "@preact/signals";
import {
  setupRealtimeConfig,
  subscribeToRegistry,
  unsubscribeAll,
} from "../lib/realtime.ts";

interface Props {
  registryId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
}

export default function RealtimeSubscription(
  { registryId, supabaseUrl, supabaseAnonKey, accessToken }: Props,
) {
  const status = useSignal("disconnected");

  useSignalEffect(() => {
    if (!registryId) return;

    console.log("[RealtimeSubscription] Mounting for registry:", registryId, {
      hasAccessToken: !!accessToken,
      tokenPreview: accessToken
        ? accessToken.substring(0, 30) + "..."
        : "MISSING",
      tokenLength: accessToken?.length ?? 0,
    });

    setupRealtimeConfig(supabaseUrl, supabaseAnonKey);
    status.value = "connecting";

    subscribeToRegistry(
      registryId,
      (payload) => {
        console.log(
          "[RealtimeSubscription] Change received:",
          payload.eventType,
        );
        status.value = `last-event: ${payload.eventType} @ ${
          new Date().toLocaleTimeString()
        }`;
      },
      accessToken,
    ).then(() => {
      status.value = "subscribed";
    }).catch((err) => {
      console.error("[RealtimeSubscription] Subscription failed:", err);
      status.value = "error";
    });

    return () => {
      console.log("[RealtimeSubscription] Unmounting, cleaning up");
      unsubscribeAll();
      status.value = "disconnected";
    };
  });

  return (
    <div class="fixed bottom-4 right-4 z-50 bg-card border border-white/10 rounded-custom px-3 py-2 text-xs text-slate-400 opacity-50 hover:opacity-100 transition-opacity">
      <span
        class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
        style={`background-color: ${
          status.value === "subscribed"
            ? "#22c55e"
            : status.value === "connecting"
            ? "#eab308"
            : "#ef4444"
        }`}
      />
      Realtime: {status.value}
    </div>
  );
}
