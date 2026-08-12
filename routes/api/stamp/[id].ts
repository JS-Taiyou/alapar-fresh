import { define } from "../../../utils.ts";
import { getRegistryStamp, isMemberOfRegistry } from "../../../lib/store.ts";
import { setUserActiveRegistry } from "../../../lib/server-cache.ts";

export const handler = define.handlers({
  // Switching the active registry is a side effect — POST only, never GET.
  GET(_ctx) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  },

  async POST(ctx) {
    const userId = ctx.state.user?.id;
    const registryId = ctx.params.id;

    if (!userId || !registryId) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    const member = await isMemberOfRegistry(userId, registryId);
    if (!member) {
      return Response.json({ error: "Not a member" }, { status: 403 });
    }

    setUserActiveRegistry(userId, registryId);

    const lastModified = await getRegistryStamp(registryId);

    return Response.json({ lastModified });
  },
});
