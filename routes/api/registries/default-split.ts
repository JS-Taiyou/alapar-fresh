import { define } from "../../../utils.ts";
import { clearDefaultSplit, setDefaultSplit } from "../../../lib/store.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const { registryId, splits } = body as {
      registryId: string;
      splits: { userId: string; percentage: number }[];
    };

    if (!registryId || !splits || !Array.isArray(splits)) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    if (!ctx.state.isOwner) {
      return Response.json({ error: "Solo el owner puede configurar esto" }, {
        status: 403,
      });
    }

    const total = splits.reduce((s, sp) => s + sp.percentage, 0);
    if (Math.abs(total - 100) >= 0.01) {
      return Response.json({ error: "Los porcentajes deben sumar 100%" }, {
        status: 400,
      });
    }

    const registryUserIds = ctx.state.participants.map((u) => u.id);
    const allValid = splits.every((s) => registryUserIds.includes(s.userId));
    if (!allValid) {
      return Response.json({ error: "Usuario no encontrado en el registro" }, {
        status: 400,
      });
    }

    if (splits.length === 0) {
      await clearDefaultSplit(registryId);
    } else {
      await setDefaultSplit(registryId, splits);
    }

    return Response.json({ ok: true });
  },

  async DELETE(ctx) {
    const body = await ctx.req.json();
    const { registryId } = body as { registryId: string };

    if (!ctx.state.isOwner) {
      return Response.json({ error: "Solo el owner" }, { status: 403 });
    }

    await clearDefaultSplit(registryId);
    return Response.json({ ok: true });
  },
});
