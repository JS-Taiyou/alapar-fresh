import { define } from "../../../utils.ts";
import { getRegistryStamp, isMemberOfRegistry } from "../../../lib/store.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const userId = ctx.state.user?.id;
    const registryId = ctx.params.id;

    if (!userId || !registryId) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    const member = await isMemberOfRegistry(userId, registryId);
    if (!member) {
      return Response.json({ error: "Not a member" }, { status: 403 });
    }

    const lastModified = await getRegistryStamp(registryId);

    return Response.json({ lastModified });
  },
});
