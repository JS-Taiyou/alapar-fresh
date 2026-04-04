import { Head } from "fresh/runtime";
import { define } from "../../utils.ts";
import { getInvitationByCode } from "../../lib/store.ts";
import JoinButton from "../../islands/JoinButton.tsx";

export const handlers = define.handlers({
  async GET(ctx) {
    const code = ctx.params.code;
    const invitation = await getInvitationByCode(code);
    return { data: { invitation, code } };
  },
});

interface JoinData {
  invitation: {
    registryName: string;
    code: string;
    expiresAt: Date | null;
    maxUses: number | null;
    currentUses: number;
    revokedAt: Date | null;
  } | null;
  code: string;
}

export default define.page(function JoinPage(ctx) {
  const data = ctx.data as JoinData;
  const isLoggedIn = ctx.state.systemUser !== null;

  if (!data.invitation) {
    return (
      <>
        <Head>
          <title>A la par - Invitación no encontrada</title>
        </Head>
        <main class="min-h-screen flex items-center justify-center p-6 bg-pattern">
          <div class="absolute inset-0 gradient-glow pointer-events-none" />
          <div class="bg-surface border border-border-custom rounded-custom p-8 w-full max-w-md z-10 text-center">
            <div class="inline-flex items-center justify-center p-3 bg-red-500/20 rounded-custom mb-4">
              <svg
                class="h-8 w-8 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-white mb-2">
              Invitación no encontrada
            </h1>
            <p class="text-slate-400 mb-6">
              El código <span class="font-mono text-white">{data.code}</span>
              {" "}
              no es válido o ha expirado.
            </p>
            <a
              href="/"
              class="inline-block px-6 py-3 bg-primary hover:bg-primary-light text-white font-semibold rounded-custom transition-all"
            >
              Ir al inicio
            </a>
          </div>
        </main>
      </>
    );
  }

  const inv = data.invitation;
  const isExpired = inv.expiresAt && inv.expiresAt < new Date();
  const isRevoked = inv.revokedAt !== null;
  const isMaxed = inv.maxUses !== null && inv.currentUses >= inv.maxUses;
  const isInvalid = isExpired || isRevoked || isMaxed;

  return (
    <>
      <Head>
        <title>A la par - Unirse a {inv.registryName}</title>
      </Head>
      <main class="min-h-screen flex items-center justify-center p-6 bg-pattern">
        <div class="absolute inset-0 gradient-glow pointer-events-none" />
        <div class="bg-surface border border-border-custom rounded-custom p-8 w-full max-w-md z-10 text-center">
          <div class="inline-flex items-center justify-center p-3 bg-emerald-500/20 rounded-custom mb-4">
            <svg
              class="h-8 w-8 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-white mb-2">
            Unirse a {inv.registryName}
          </h1>
          <p class="text-slate-400 mb-6">
            Has sido invitado a un grupo de gastos compartidos.
          </p>

          {isInvalid
            ? (
              <div class="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-custom px-4 py-3">
                {isExpired && "Esta invitación ha expirado."}
                {isRevoked && "Esta invitación ha sido revocada."}
                {isMaxed && "Esta invitación ha alcanzado el máximo de usos."}
              </div>
            )
            : isLoggedIn
            ? <JoinButton code={inv.code} />
            : (
              <div class="space-y-3">
                <a
                  href={`/login?redirect=/join/${inv.code}`}
                  class="block w-full py-3 bg-primary hover:bg-primary-light text-white font-semibold rounded-custom transition-all shadow-lg"
                >
                  Iniciar Sesión para Unirme
                </a>
                <a
                  href={`/signup?redirect=/join/${inv.code}`}
                  class="block w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-custom transition-all"
                >
                  Crear Cuenta
                </a>
              </div>
            )}
        </div>
      </main>
    </>
  );
});
