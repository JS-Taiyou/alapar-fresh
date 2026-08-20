import { define } from "../../utils.ts";
import { getTransactionCounts } from "../../lib/store.ts";
import {
  getCachedTransactionCounts,
  setCachedTransactionCounts,
} from "../../lib/server-cache.ts";
import Sidebar from "../../islands/Sidebar.tsx";
import { initials } from "../../lib/format.ts";

export default define.layout(async function DashboardLayout(ctx) {
  const user = ctx.state.user;
  const userName = user?.name ?? "Usuario";
  const userInitials = initials(userName);

  const deletableRegistryIds = new Set<string>();
  if (ctx.state.registries.length > 0) {
    const registryIds = ctx.state.registries.map((r) => r.id);
    const { counts, hit } = getCachedTransactionCounts(registryIds);
    let finalCounts = counts;
    if (!hit) {
      finalCounts = await getTransactionCounts(registryIds);
      void setCachedTransactionCounts(finalCounts);
    }
    for (const r of ctx.state.registries) {
      if ((finalCounts.get(r.id) ?? 0) === 0) deletableRegistryIds.add(r.id);
    }
  }

  const sidebarCollapsed = ctx.req.headers.get("cookie")
    ?.split(";")
    .some((c) => c.trim() === "sidebar-collapsed=true") ?? false;

  return (
    <div class="flex h-screen overflow-hidden">
      <Sidebar
        registries={ctx.state.registries}
        activeRegistryId={ctx.state.activeRegistry?.id ?? ""}
        userName={userName}
        userInitials={userInitials}
        isOwner={ctx.state.isOwner}
        ownerRegistryIds={ctx.state.ownerRegistryIds}
        entities={ctx.state.entities}
        registryUsers={ctx.state.registryUsers}
        defaultSplit={ctx.state.activeRegistry?.defaultSplit ?? null}
        deletableRegistryIds={deletableRegistryIds}
        initialCollapsed={sidebarCollapsed}
        locale={ctx.state.locale}
        showUpgrade={ctx.state.activeRegistryPlan !== null &&
          !ctx.state.activeRegistryPlan.isPro}
      />
      <div class="flex-1 flex flex-col min-w-0">
        <ctx.Component />
      </div>
    </div>
  );
});
