import { define } from "../../../utils.ts";
import { deleteEntity, updateEntity } from "../../../lib/store.ts";
import { invalidateRegistry } from "../../../lib/server-cache.ts";

export const handler = define.handlers({
  async PUT(ctx) {
    const id = ctx.params.id;
    const body = await ctx.req.json();
    const { name, color } = body;

    if (!name || !name.trim()) {
      return new Response(JSON.stringify({ error: "Nombre requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) {
      return new Response(JSON.stringify({ error: "Sin registro activo" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const entity = await updateEntity(registryId, id, name.trim(), color);
    if (!entity) {
      return new Response(JSON.stringify({ error: "Entidad no encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    invalidateRegistry(registryId);

    return new Response(
      JSON.stringify({
        id: entity.id,
        name: entity.name,
        color: entity.color,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  async DELETE(ctx) {
    const id = ctx.params.id;
    const registryId = ctx.state.activeRegistry?.id;
    if (!registryId) {
      return new Response(JSON.stringify({ error: "Sin registro activo" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const deleted = await deleteEntity(registryId, id);
    if (!deleted) {
      return new Response(
        JSON.stringify({
          error: "No se puede eliminar: tiene transacciones activas",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    invalidateRegistry(registryId);

    return new Response(null, { status: 204 });
  },
});
