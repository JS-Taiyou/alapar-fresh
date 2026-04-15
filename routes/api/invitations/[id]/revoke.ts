import { define } from "../../../../utils.ts";
import { getUserRole, revokeInvitation } from "../../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const invitationId = ctx.params.id;
    const systemUserId = ctx.state.user?.id;
    const activeRegistryId = ctx.state.activeRegistry?.id;

    if (!invitationId || !systemUserId || !activeRegistryId) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    const role = await getUserRole(systemUserId, activeRegistryId);
    if (role !== "owner") {
      return Response.json({ error: "Only owners can revoke invitations" }, {
        status: 403,
      });
    }

    await revokeInvitation(invitationId, systemUserId);

    return Response.json({ ok: true });
  },
});
