import { define } from "../../../utils.ts";
import { getInvitationsForRegistry, getUserRole } from "../../../lib/store.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.req.url);
    const registryId = url.searchParams.get("registryId");
    const systemUserId = ctx.state.user?.id;

    if (!registryId || !systemUserId) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    const role = await getUserRole(systemUserId, registryId);
    if (role !== "owner") {
      return Response.json({ error: "Only owners can list invitations" }, {
        status: 403,
      });
    }

    const invitations = await getInvitationsForRegistry(registryId);

    return Response.json(invitations);
  },
});
