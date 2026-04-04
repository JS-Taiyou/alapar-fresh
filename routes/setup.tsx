import { Head } from "fresh/runtime";
import { define } from "../utils.ts";

export default define.page(function Setup() {
  return (
    <>
      <Head>
        <title>A la par - Configuración</title>
      </Head>
      <main class="min-h-screen flex items-center justify-center p-6 bg-pattern">
        <div class="absolute inset-0 gradient-glow pointer-events-none" />
        <div class="bg-surface border border-border-custom rounded-custom p-8 w-full max-w-md z-10">
          <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center p-3 bg-primary rounded-custom mb-4">
              <svg class="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-white">Configura tu perfil</h1>
            <p class="text-slate-400 text-sm mt-2">Ingresa tus datos para comenzar</p>
          </div>
          <form action="/api/users/setup" method="POST" class="space-y-5">
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1.5" for="name">Nombre</label>
              <input
                class="block w-full px-4 py-2.5 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
                id="name"
                name="name"
                type="text"
                placeholder="Tu nombre"
                required
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1.5" for="email">Email</label>
              <input
                class="block w-full px-4 py-2.5 bg-background border border-border-custom rounded-custom text-white focus:ring-primary focus:border-primary"
                id="email"
                name="email"
                type="email"
                placeholder="tu@email.com"
                required
              />
            </div>
            <button
              type="submit"
              class="w-full py-3 bg-primary hover:bg-primary-light text-white font-semibold rounded-custom transition-all shadow-lg active:scale-95"
            >
              Comenzar
            </button>
          </form>
        </div>
      </main>
    </>
  );
});
