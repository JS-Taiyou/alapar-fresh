import { define } from "../../../../utils.ts";
import { getUserRole, revokeInvitation } from "../../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const invitationId = ctx.params.id;
    const systemUserId = ctx.state.user?.id;
    const activeRegistryId = ctx.state.activeRegistry?.id;

    if (!invitationId || !systemUserId || !activeRegistryId) {
      return new Response(JSON.stringify({ error: "Missing data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const role = await getUserRole(systemUserId, activeRegistryId);
    if (role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Only owners can revoke invitations" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    await revokeInvitation(invitationId, systemUserId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
