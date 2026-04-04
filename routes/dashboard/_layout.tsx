import { define } from "../../utils.ts";
import Sidebar from "../../islands/Sidebar.tsx";

export default define.layout(function DashboardLayout(ctx) {
  const user = ctx.state.systemUser;
  const userName = user?.name ?? "Usuario";
  const userInitials = userName.split(" ").map((n) => n[0]).join("").substring(
    0,
    2,
  ).toUpperCase();

  return (
    <div class="flex h-screen overflow-hidden">
      <Sidebar
        registries={ctx.state.registries}
        activeRegistryId={ctx.state.activeRegistry?.id ?? ""}
        userName={userName}
        userInitials={userInitials}
        isOwner={ctx.state.isOwner}
      />
      <div class="flex-1 flex flex-col min-w-0">
        <ctx.Component />
      </div>
    </div>
  );
});
