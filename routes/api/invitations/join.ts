import { define } from "../../../utils.ts";
import { useInvitation as acceptInvitation } from "../../../lib/store.ts";
import { t } from "../../../lib/i18n.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const code = body.code as string;
    const systemUserId = ctx.state.user?.id;

    if (!code || !systemUserId) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    try {
      const registryId = await acceptInvitation(code, systemUserId);
      return Response.json({ registryId });
    } catch (err) {
      // Map the plan-limit sentinel to a 402 upgrade signal with a friendly
      // localized message; everything else stays a plain 400.
      if (err instanceof Error && err.message === "GROUP_FULL") {
        return Response.json({
          code: "upgrade_required",
          reason: "members",
          error: t(ctx.state.locale, "billing.group_full"),
        }, { status: 402 });
      }
      return Response.json({
        error: err instanceof Error ? err.message : "Unknown error",
      }, { status: 400 });
    }
  },
});
