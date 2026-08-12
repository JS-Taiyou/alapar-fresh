import { define } from "../../../utils.ts";
import { createEntity, getEntities } from "../../../lib/store.ts";
import { invalidateRegistry } from "../../../lib/server-cache.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(ctx.req.url);
    const registryId = url.searchParams.get("registryId") ||
      ctx.state.activeRegistry?.id;
    if (!registryId) {
      return Response.json([]);
    }

    // Mirror the POST membership check: a registryId the user doesn't belong
    // to must not leak its entities.
    const isMember = ctx.state.registries.some((r) => r.id === registryId);
    if (!isMember) {
      return Response.json({ error: "No eres miembro" }, { status: 403 });
    }

    const entities = await getEntities(registryId, userId);
    return Response.json(entities.map((e) => ({
      id: e.id,
      name: e.name,
      color: e.color,
    })));
  },

  async POST(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await ctx.req.json();
    const { name, color, registryId } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: "Nombre requerido" }, { status: 400 });
    }

    const activeRegistryId = registryId || ctx.state.activeRegistry?.id;
    if (!activeRegistryId) {
      return Response.json({ error: "Sin registro activo" }, { status: 400 });
    }

    const isMember = ctx.state.registries.some((r) =>
      r.id === activeRegistryId
    );
    if (!isMember) {
      return Response.json({ error: "No eres miembro" }, { status: 403 });
    }

    const entity = await createEntity(
      activeRegistryId,
      name.trim(),
      color,
      userId,
    );
    if (!entity) {
      return Response.json({ error: "No eres miembro" }, { status: 403 });
    }

    invalidateRegistry(activeRegistryId);

    return Response.json({
      id: entity.id,
      name: entity.name,
      color: entity.color,
    }, { status: 201 });
  },
});
