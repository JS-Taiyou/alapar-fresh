import { define } from "../../../utils.ts";
import { getInvitationsForRegistry, getUserRole } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.req.url);
    const registryId = url.searchParams.get("registryId");
    const systemUserId = ctx.state.systemUser?.id;

    if (!registryId || !systemUserId) {
      return new Response(JSON.stringify({ error: "Missing data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const role = await getUserRole(systemUserId, registryId);
    if (role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Only owners can list invitations" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const invitations = await getInvitationsForRegistry(registryId);

    return new Response(JSON.stringify(invitations), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
