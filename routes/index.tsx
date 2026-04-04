import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import JoinCodeForm from "../islands/JoinCodeForm.tsx";

export default define.page(function Home() {
  return (
    <>
      <Head>
        <title>A la par - Gestión de Gastos Grupales</title>
      </Head>
      <main class="relative h-screen flex flex-col items-center justify-center p-6 bg-pattern">
        <div class="absolute inset-0 gradient-glow pointer-events-none" />
        <header class="text-center mb-12 z-10">
          <div class="inline-flex items-center justify-center p-3 bg-primary rounded-custom mb-4 shadow-lg shadow-primary/20">
            <svg
              class="h-10 w-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </div>
          <h1 class="text-4xl font-bold tracking-tight text-white mb-2">
            A la par
          </h1>
          <p class="text-slate-400 text-lg max-w-md mx-auto">
            La forma más sencilla de dividir gastos con amigos, familiares o
            compañeros de viaje.
          </p>
        </header>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl z-10">
          <a
            href="/registries/new"
            class="group relative bg-surface p-8 border border-slate-700 rounded-custom hover:border-primary transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 text-left"
          >
            <div class="mb-6 inline-block p-4 bg-primary/10 rounded-full text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
              <svg
                class="h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 4v16m8-8H4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
            <h2 class="text-2xl font-semibold text-white mb-2">
              Nuevo registro
            </h2>
            <p class="text-slate-400">
              Crea un nuevo grupo de gastos para tu próximo viaje o evento.
            </p>
            <div class="mt-6 flex items-center text-primary font-medium">
              <span>Comenzar</span>
              <svg
                class="h-5 w-5 ml-2 transform group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 5l7 7-7 7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
          </a>
          <div class="group relative bg-surface p-8 border border-slate-700 rounded-custom hover:border-emerald-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10 text-left">
            <div class="mb-6 inline-block p-4 bg-emerald-500/10 rounded-full text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
              <svg
                class="h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
            <h2 class="text-2xl font-semibold text-white mb-2">
              Unirme a registro
            </h2>
            <p class="text-slate-400 mb-4">
              Introduce un código de invitación para unirte a un grupo
              existente.
            </p>
            <JoinCodeForm />
          </div>
        </div>
        <footer class="absolute bottom-8 text-slate-500 text-sm">
          <p>&copy; 2024 A la par. Finanzas transparentes.</p>
        </footer>
      </main>
    </>
  );
});
