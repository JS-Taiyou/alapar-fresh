import { define } from "../../../utils.ts";
import { createEntity, getEntities } from "../../../lib/store.ts";
import { invalidateRegistry } from "../../../lib/server-cache.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.req.url);
    const registryId = url.searchParams.get("registryId") ||
      ctx.state.activeRegistry?.id;
    if (!registryId) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }
    const entities = await getEntities(registryId);
    return new Response(
      JSON.stringify(entities.map((e) => ({
        id: e.id,
        name: e.name,
        color: e.color,
      }))),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  async POST(ctx) {
    const body = await ctx.req.json();
    const { name, color, registryId } = body;

    if (!name || !name.trim()) {
      return new Response(JSON.stringify({ error: "Nombre requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const activeRegistryId = registryId || ctx.state.activeRegistry?.id;
    if (!activeRegistryId) {
      return new Response(JSON.stringify({ error: "Sin registro activo" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isMember = ctx.state.registries.some((r) =>
      r.id === activeRegistryId
    );
    if (!isMember) {
      return new Response(JSON.stringify({ error: "No eres miembro" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const entity = await createEntity(activeRegistryId, name.trim(), color);

    invalidateRegistry(activeRegistryId);

    return new Response(
      JSON.stringify({
        id: entity.id,
        name: entity.name,
        color: entity.color,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
});
