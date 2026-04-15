import { define } from "../../../utils.ts";
import { createInvitation, getUserRole } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const registryId = body.registryId as string;
    const systemUserId = ctx.state.user?.id;

    if (!registryId || !systemUserId) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    const role = await getUserRole(systemUserId, registryId);
    if (role !== "owner") {
      return Response.json({ error: "Only owners can create invitations" }, {
        status: 403,
      });
    }

    const expiresAt = body.expiresAt
      ? new Date(body.expiresAt as string)
      : undefined;
    const maxUses = body.maxUses as number | undefined;

    const invitation = await createInvitation(
      registryId,
      systemUserId,
      expiresAt,
      maxUses,
    );

    return Response.json({
      id: invitation.id,
      code: invitation.code,
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
    });
  },
});
