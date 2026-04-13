import { define } from "../../../utils.ts";

export const handler = define.handlers({
  GET() {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    return Response.json({ publicKey });
  },
});
