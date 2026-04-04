import { define } from "../../../utils.ts";
import { clearDefaultSplit, setDefaultSplit } from "../../../lib/store.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const { registryId, splits } = body as {
      registryId: string;
      splits: { userId: string; percentage: number }[];
    };

    if (!registryId || !splits || !Array.isArray(splits)) {
      return new Response(JSON.stringify({ error: "Datos inválidos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!ctx.state.isOwner) {
      return new Response(
        JSON.stringify({ error: "Solo el owner puede configurar esto" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const total = splits.reduce((s, sp) => s + sp.percentage, 0);
    if (Math.abs(total - 100) >= 0.01) {
      return new Response(
        JSON.stringify({ error: "Los porcentajes deben sumar 100%" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const registryUserIds = ctx.state.registryUsers.map((u) => u.id);
    const allValid = splits.every((s) => registryUserIds.includes(s.userId));
    if (!allValid) {
      return new Response(
        JSON.stringify({ error: "Usuario no encontrado en el registro" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (splits.length === 0) {
      await clearDefaultSplit(registryId);
    } else {
      await setDefaultSplit(registryId, splits);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async DELETE(ctx) {
    const body = await ctx.req.json();
    const { registryId } = body as { registryId: string };

    if (!ctx.state.isOwner) {
      return new Response(JSON.stringify({ error: "Solo el owner" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await clearDefaultSplit(registryId);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
