import { useEffect, useState } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * Guided tour island for the /demo page, powered by driver.js (MIT, zero deps).
 *
 * Offers two tours the user can choose from via a floating button (bottom-left,
 * so it doesn't clash with the FABs at bottom-right):
 *
 * - **Tour Rápido** (5 steps): main-page highlights only.
 * - **Tour Completo** (10 steps): main page + modal walkthrough (type selector,
 *   split modes, pay-exact-debt button).
 *
 * The deep-dive tour programmatically opens the modal by clicking the FABs,
 * waits for the DOM to render, highlights the internal elements, then closes
 * the modal via Escape before continuing. This coordination is handled via
 * driver.js per-step lifecycle hooks (`onPopoverRender`, `onDestroyStarted`).
 *
 * A `localStorage` flag suppresses auto-prompt after the first visit, but the
 * floating button is always visible so users can replay.
 */

// driver.js is client-side only; lazy-import inside useEffect to avoid SSR.
export default function DemoTour() {
  const showMenu = useSignal(false);
  const [tourActive, setTourActive] = useState(false);

  useEffect(() => {
    // Auto-prompt on first visit (only if never seen).
    const seen = localStorage.getItem("demo-tour-seen");
    if (!seen) {
      // Small delay so the page finishes rendering.
      const timer = setTimeout(() => showMenu.value = true, 800);
      return () => clearTimeout(timer);
    }
  }, []);

  /**
   * Find the visible add-expense or add-payment button. On desktop the FABs
   * carry data-tour="add-expense"/"add-payment"; on mobile the inline buttons
   * carry the "-mobile" suffix. Return whichever is currently displayed.
   */
  function visibleFab(base: "add-expense" | "add-payment"): Element {
    const desktop = document.querySelector(`[data-tour="${base}"]`);
    if (desktop && desktop.checkVisibility?.()) return desktop;
    const mobile = document.querySelector(`[data-tour="${base}-mobile"]`);
    if (mobile && mobile.checkVisibility?.()) return mobile;
    // Fallback: offsetParent is non-null for visible elements.
    const all = document.querySelectorAll(
      `[data-tour="${base}"], [data-tour="${base}-mobile"]`,
    );
    for (const el of all) {
      if ((el as HTMLElement).offsetParent !== null) return el;
    }
    return desktop ?? mobile ?? document.body;
  }

  function markSeen() {
    localStorage.setItem("demo-tour-seen", "true");
  }

  function closeModals() {
    // Close any open modal by pressing Escape (the modal listens for it).
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  }

  function openModal(base: "add-expense" | "add-payment"): Promise<void> {
    return new Promise((resolve) => {
      const fab = visibleFab(base) as HTMLElement | null;
      fab?.click();
      // Wait for Preact to render the modal.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  function startQuickTour() {
    showMenu.value = false;
    setTourActive(true);
    markSeen();

    const driverObj = driver({
      showProgress: true,
      onDestroyed: () => setTourActive(false),
      nextBtnText: "Siguiente →",
      prevBtnText: "← Anterior",
      doneBtnText: "Listo ✓",
      popoverClass: "alapar-popover",
      steps: [
        {
          element: '[data-tour="balance-total"]',
          popover: {
            title: "💰 Balance Total",
            description:
              "Este es tu balance neto. Verde = te deben, rojo = debes. Haz clic para ver el desglose detallado por persona.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: '[data-tour="transaction-list"]',
          popover: {
            title: "📋 Transacciones",
            description:
              "Aquí verás todos los gastos y pagos del registro actual, ordenados por fecha.",
            side: "top",
            align: "center",
          },
        },
        {
          element: () => visibleFab("add-expense"),
          popover: {
            title: "➕ Agregar Gasto",
            description:
              "Usa este botón para registrar un gasto. Puedes dividirlo entre todos en partes iguales, por porcentaje, o con montos fijos.",
            side: "left",
            align: "center",
          },
        },
        {
          element: () => visibleFab("add-payment"),
          popover: {
            title: "💸 Agregar Pago",
            description:
              "Usa este botón para registrar un pago entre personas y saldar deudas.",
            side: "left",
            align: "center",
          },
        },
        {
          element: '[data-tour="transaction-card"]',
          popover: {
            title: "✏️ Editar Transacciones",
            description:
              "Haz clic en cualquier transacción para ver sus detalles, editarla o eliminarla.",
            side: "top",
            align: "center",
          },
        },
      ],
    });

    driverObj.drive();
  }

  function startFullTour() {
    showMenu.value = false;
    setTourActive(true);
    markSeen();

    const driverObj = driver({
      showProgress: true,
      onDestroyed: () => {
        closeModals();
        setTourActive(false);
      },
      nextBtnText: "Siguiente →",
      prevBtnText: "← Anterior",
      doneBtnText: "Listo ✓",
      popoverClass: "alapar-popover",
      steps: [
        // --- Main page (same as quick tour) ---
        {
          element: '[data-tour="balance-total"]',
          popover: {
            title: "💰 Balance Total",
            description:
              "Este es tu balance neto. Verde = te deben, rojo = debes. Haz clic para ver el desglose detallado por persona.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: '[data-tour="search-bar"]',
          popover: {
            title: "🔍 Buscar y Filtrar",
            description:
              "Busca transacciones por nombre o filtra por persona con los botones de arriba.",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: '[data-tour="transaction-list"]',
          popover: {
            title: "📋 Transacciones",
            description:
              "Todos los gastos y pagos del registro. Cada tarjeta muestra quién pagó y cómo se dividió.",
            side: "top",
            align: "center",
          },
        },
        {
          element: () => visibleFab("add-expense"),
          popover: {
            title: "➕ Agregar Gasto",
            description:
              "Vamos a abrir el formulario para crear un gasto y ver las opciones disponibles.",
            side: "left",
            align: "center",
            onNextClick: async () => {
              await openModal("add-expense");
              driverObj.moveNext();
            },
          },
        },
        // --- Inside expense modal ---
        {
          element: '[data-tour="expense-type"]',
          popover: {
            title: "🏷️ Tipo de Gasto",
            description:
              "Elige el tipo: Único (pago una sola vez), Parcialidad (pagos en partes, ej. un laptop a meses), o Recurrente (se repite cada periodo, ej. la renta).",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: '[data-tour="split-mode"]',
          popover: {
            title: "🔀 Modo de División",
            description:
              "Decide cómo dividir el gasto: Automático (partes iguales), Porcentaje (ej. 60%/40%), o Monto Fijo (cantidades específicas por persona).",
            side: "bottom",
            align: "end",
            onPrevClick: () => driverObj.movePrevious(),
            onNextClick: () => {
              closeModals();
              setTimeout(() => {
                openModal("add-payment").then(() => driverObj.moveNext());
              }, 200);
            },
          },
        },
        // --- Inside payment modal ---
        {
          element: '[data-tour="pay-debt"]',
          popover: {
            title: "✅ Saldar Deuda",
            description:
              "Cuando alguien te debe, este botón calcula automáticamente el monto exacto. Un clic y el pago queda registrado por la cantidad correcta.",
            side: "bottom",
            align: "center",
            onPrevClick: async () => {
              closeModals();
              await openModal("add-expense");
              driverObj.movePrevious();
            },
          },
        },
        {
          popover: {
            title: "🎉 ¡Eso es todo!",
            description:
              "Ya conoces las funciones principales de A la Par. Explora el demo libremente — todos los cambios son temporales y se reinician al recargar.",
            side: "top",
            align: "center",
            onDoneClick: () => {
              closeModals();
              driverObj.destroy();
              setTourActive(false);
            },
          },
        },
      ],
    });

    driverObj.drive();
  }

  if (tourActive) return null;

  return (
    <>
      {/* Floating tour button */}
      <button
        type="button"
        onClick={() => showMenu.value = !showMenu.value}
        class="fixed bottom-8 left-8 z-50 w-14 h-14 bg-primary hover:bg-primary-light text-white rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        title="Tour guiado"
      >
        <svg
          class="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
          />
        </svg>
      </button>

      {/* Tour selection menu */}
      {showMenu.value && (
        <>
          {/* Backdrop */}
          <div
            class="fixed inset-0 z-40"
            onClick={() => showMenu.value = false}
          />
          {/* Menu card */}
          <div class="fixed bottom-24 left-8 z-50 bg-surface border border-border-custom rounded-custom shadow-2xl p-4 w-72 animate-fade-up">
            <h3 class="text-sm font-bold text-zinc-200 mb-3">
              🎓 Tour Guiado
            </h3>
            <p class="text-xs text-zinc-400 mb-4">
              Conoce las funciones de A la Par en pocos minutos.
            </p>
            <button
              type="button"
              onClick={startQuickTour}
              class="w-full mb-2 px-4 py-3 bg-primary hover:bg-primary-light text-white text-sm font-semibold rounded-custom transition-all active:scale-95 text-left"
            >
              <span class="block font-bold">Tour Rápido</span>
              <span class="block text-xs opacity-80 mt-0.5">
                Lo esencial en 5 pasos
              </span>
            </button>
            <button
              type="button"
              onClick={startFullTour}
              class="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-custom transition-all active:scale-95 text-left"
            >
              <span class="block font-bold">Tour Completo</span>
              <span class="block text-xs opacity-60 mt-0.5">
                Incluye el modal de gastos y pagos
              </span>
            </button>
          </div>
        </>
      )}
    </>
  );
}
