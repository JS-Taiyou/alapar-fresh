import { define } from "../../utils.ts";
import { getTransactionCounts } from "../../lib/store.ts";
import Sidebar from "../../islands/Sidebar.tsx";

export default define.layout(async function DashboardLayout(ctx) {
  const user = ctx.state.systemUser;
  const userName = user?.name ?? "Usuario";
  const userInitials = userName.split(" ").map((n) => n[0]).join("").substring(
    0,
    2,
  ).toUpperCase();

  const entities = ctx.state.registryUsers.filter((u) => u.isEntity);

  const deletableRegistryIds = new Set<string>();
  if (ctx.state.registries.length > 0) {
    const counts = await getTransactionCounts(
      ctx.state.registries.map((r) => r.id),
    );
    for (const r of ctx.state.registries) {
      if ((counts.get(r.id) ?? 0) === 0) deletableRegistryIds.add(r.id);
    }
  }

  return (
    <div class="flex h-screen overflow-hidden">
      <Sidebar
        registries={ctx.state.registries}
        activeRegistryId={ctx.state.activeRegistry?.id ?? ""}
        userName={userName}
        userInitials={userInitials}
        isOwner={ctx.state.isOwner}
        entities={entities}
        registryUsers={ctx.state.registryUsers}
        defaultSplit={ctx.state.activeRegistry?.defaultSplit ?? null}
        deletableRegistryIds={deletableRegistryIds}
      />
      <div class="flex-1 flex flex-col min-w-0">
        <ctx.Component />
      </div>
    </div>
  );
});
