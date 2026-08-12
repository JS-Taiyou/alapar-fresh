import { define } from "../../../utils.ts";
import { deleteEntity, updateEntity } from "../../../lib/store.ts";
import { invalidateRegistry } from "../../../lib/server-cache.ts";

export const handler = define.handlers({
  async PUT(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = ctx.params.id;
    const body = await ctx.req.json();
    const { name, color } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: "Nombre requerido" }, { status: 400 });
    }

    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) {
      return Response.json({ error: "Sin registro activo" }, { status: 400 });
    }

    const entity = await updateEntity(
      registryId,
      id,
      name.trim(),
      color,
      userId,
    );
    if (!entity) {
      return Response.json({ error: "Entidad no encontrada" }, { status: 404 });
    }

    invalidateRegistry(registryId);

    return Response.json({
      id: entity.id,
      name: entity.name,
      color: entity.color,
    });
  },

  async DELETE(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = ctx.params.id;
    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) {
      return Response.json({ error: "Sin registro activo" }, { status: 400 });
    }

    const deleted = await deleteEntity(registryId, id, userId);
    if (!deleted) {
      return Response.json({
        error: "No se puede eliminar: tiene transacciones activas",
      }, { status: 409 });
    }

    invalidateRegistry(registryId);

    return new Response(null, { status: 204 });
  },
});
