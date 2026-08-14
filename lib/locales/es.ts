/**
 * Spanish (default) translation dictionary.
 *
 * Keys follow the convention: `screen.element` or `category.concept`.
 * Interpolation placeholders use `{name}` syntax.
 *
 * Phase 1: auth screens, landing page, dashboard core.
 * Phase 2 keys will be appended in a follow-up.
 */
export const es: Record<string, string> = {
  // --- Common ---
  "common.loading": "Cargando...",
  "common.saving": "Guardando...",
  "common.save": "Guardar",
  "common.cancel": "Cancelar",
  "common.delete": "Eliminar",
  "common.close": "Cerrar",
  "common.create": "Crear",
  "common.error_connection": "Error de conexión",
  "common.error_unknown": "Error desconocido",
  "common.you_label": "(Tú)",
  "common.tercero_badge": "tercero",

  // --- App / page titles ---
  "app.name": "A la par",
  "app.tagline":
    "La forma más sencilla de dividir gastos con amigos, familiares o compañeros de viaje.",

  // --- Landing page ---
  "landing.new_registry": "Nuevo registro",
  "landing.new_registry_desc":
    "Crea un nuevo grupo de gastos para tu próximo viaje o evento.",
  "landing.start": "Comenzar",
  "landing.join_registry": "Unirme a registro",
  "landing.join_registry_desc":
    "Introduce un código de invitación para unirte a un grupo existente.",
  "landing.copyright": "© 2024 A la par. Finanzas transparentes.",

  // --- Auth ---
  "auth.login": "Iniciar Sesión",
  "auth.login_subtitle": "Ingresa a tu cuenta de A la par",
  "auth.signup": "Crear Cuenta",
  "auth.signup_subtitle": "Regístrate para empezar a dividir gastos",
  "auth.forgot_password": "Recuperar Contraseña",
  "auth.forgot_password_subtitle":
    "Ingresa tu email y te enviaremos un enlace para restablecerla",
  "auth.reset_password": "Nueva Contraseña",
  "auth.reset_password_subtitle": "Ingresa tu nueva contraseña",
  "auth.name": "Nombre",
  "auth.name_placeholder": "Tu nombre",
  "auth.email": "Email",
  "auth.email_placeholder": "tu@email.com",
  "auth.password": "Contraseña",
  "auth.show_password": "Mostrar contraseña",
  "auth.hide_password": "Ocultar contraseña",
  "auth.google": "Continuar con Google",
  "auth.or": "o",
  "auth.forgot_link": "Olvidaste tu contraseña?",
  "auth.no_account": "No tienes cuenta?",
  "auth.signup_link": "Regístrate",
  "auth.has_account": "Ya tienes cuenta?",
  "auth.login_link": "Inicia sesión",
  "auth.not_authorized":
    "Tu email no está autorizado para usar esta aplicación.",
  "auth.email_not_allowed": "Este email no está autorizado para registrarse.",
  "auth.check_email": "Revisa tu email para confirmar tu cuenta.",
  "auth.email_verify_error": "Error al verificar email.",
  "auth.session_error": "Error al guardar la sesión",

  // --- Forgot password ---
  "forgot.submit": "Enviar enlace de recuperación",
  "forgot.sending": "Enviando...",
  "forgot.back_login": "Volver a iniciar sesión",
  "forgot.success":
    "Te enviamos un email con el enlace para restablecer tu contraseña.",

  // --- Reset password ---
  "reset.new_password": "Nueva contraseña",
  "reset.confirm_password": "Confirmar contraseña",
  "reset.submit": "Restablecer contraseña",
  "reset.updating": "Actualizando...",
  "reset.success": "Tu contraseña fue actualizada correctamente.",
  "reset.invalid_link":
    "Enlace de recuperación inválido o expirado. Solicita uno nuevo.",
  "reset.session_failed":
    "No se pudo establecer la sesión. El enlace puede haber expirado.",
  "reset.password_too_short": "La contraseña debe tener al menos 6 caracteres.",
  "reset.password_mismatch": "Las contraseñas no coinciden.",
  "reset.request_new": "Solicitar un nuevo enlace",
  "reset.verifying": "Verificando enlace...",

  // --- Auth callback ---
  "auth_callback.title": "A la par - Autenticando",
  "auth_callback.authenticating": "Autenticando...",
  "auth_callback.no_tokens": "No se recibieron tokens de autenticación.",
  "auth_callback.auth_failed": "No se pudo completar la autenticación.",
  "auth_callback.technical_details": "Detalles técnicos",
  "auth_callback.back_login": "Volver a iniciar sesión",

  // --- Balance ---
  "balance.total": "Balance Total",
  "balance.breakdown_title": "Desglose por persona",
  "balance.breakdown_subtitle": "Detalle de saldos con cada miembro",
  "balance.all_settled": "Todos están balanceados",
  "balance.owed_to_you": "Te deben",
  "balance.you_owe": "Debes",

  // --- Transaction list ---
  "tx.current_period": "Ejercicio actual",
  "tx.current_period_filtered": "Ejercicio actual (pagados por {name})",
  "tx.all": "Todos",
  "tx.search_placeholder": "Buscar transacción...",
  "tx.empty_title": "Sin transacciones",
  "tx.empty_desc": "Agrega un gasto o un pago",
  "tx.no_results": "No se encontraron transacciones con estos filtros.",
  "tx.clear_filters": "Limpiar filtros",
  "tx.add_expense_mobile": "Gasto",
  "tx.add_payment_mobile": "Pago",
  "tx.add_expense_tooltip": "Agregar gasto",
  "tx.add_payment_tooltip": "Agregar pago",
  "tx.paid_by_you": "Tú pagaste",
  "tx.paid_by_other": "{name} pagó",
  "tx.paid_to": "Le pagaste a {name}",
  "tx.received_from": "Te pagó {name}",
  "tx.of_total": "de {total}",
  "tx.notification_title": "Nueva transacción",
  "tx.notification_body": "Nueva transacción",
  "tx.badge_payment": "Pago",
  "tx.badge_adjustment": "Saldo pendiente",
  "tx.badge_installment": "{current}/{total}",
  "tx.single_user_title": "Está muy solo aquí",
  "tx.single_user_desc":
    "Asegúrate de invitar otros usuarios o crear un tercero",
  "tx.tercero_tooltip":
    "Un tercero es una entidad diferente de ti pero que no se va a registrar como usuario, por ejemplo: un banco!",

  // --- Transaction modal ---
  "modal.new_expense": "Nuevo Gasto",
  "modal.edit_expense": "Editar Gasto",
  "modal.new_expense_subtitle": "Configura cómo se divide este gasto.",
  "modal.edit_expense_subtitle": "Modifica los detalles del gasto.",
  "modal.new_payment": "Nuevo Pago",
  "modal.edit_payment": "Editar Pago",
  "modal.new_payment_subtitle": "Registra un pago entre usuarios.",
  "modal.edit_payment_subtitle": "Modifica los detalles del pago.",
  "modal.description": "Descripción",
  "modal.description_expense_placeholder": "Ej: Supermercado semanal",
  "modal.description_payment_placeholder": "Ej: Pago de balance",
  "modal.amount_total": "Monto Total",
  "modal.amount_payment": "Monto del Pago",
  "modal.amount_installment": "Monto por Parcialidad",
  "modal.type": "Tipo",
  "type.unico": "Único",
  "type.parcialidad": "Parcialidad",
  "type.recurrente": "Recurrente",
  "modal.installment_mode_total": "Monto Total",
  "modal.installment_mode_per": "Monto por Parcialidad",
  "modal.installment_current": "Parcialidad Actual",
  "modal.installment_of": "de",
  "modal.installment_months": "meses",
  "modal.installment_count": "{n} parcialidades",
  "modal.payer": "Pagó",
  "modal.notes": "Notas (opcional)",
  "modal.notes_placeholder": "Notas adicionales...",
  "modal.pay_debt": "Los {amount} pendientes",
  "modal.transfer_section": "Transferencia",
  "modal.user_header": "USUARIO",
  "modal.paid_header": "Pagó",
  "modal.received_header": "Recibió",
  "modal.balance_header": "SALDO",
  "modal.owes_you": "Te debe {amount}",
  "modal.you_owe_them": "Le debes {amount}",
  "modal.link_expenses": "Relacionar este pago a gastos existentes",
  "modal.link_expenses_tooltip":
    "Sólo puedes relacionar pagos cuando tienes saldo por pagar!",
  "modal.search_expense": "Buscar gasto...",
  "modal.no_expenses_found": "No se encontraron gastos.",
  "modal.paid_by_name": "Pagó {name}",
  "modal.allocation_fully_covered": "Completamente cubierto",
  "modal.allocation_partial": "Cubriendo {covered} de {total}",
  "modal.allocation_unassigned": "Sin asignar",
  "modal.allocation_expense": "Gasto",
  "modal.allocation_section": "Distribución",
  "modal.split_section": "División",
  "modal.split_auto": "Auto",
  "modal.split_percentage": "Porcentaje",
  "modal.split_fixed": "Monto Fijo",
  "modal.amount_header": "MONTO",
  "modal.total_header": "TOTAL",
  "modal.delete_confirm": "Eliminar esta transacción?",
  "modal.unknown_payer": "Desconocido",
  "modal.default_payment_desc": "Pago",

  // --- Registries ---
  "registry.new": "Nuevo Registro",
  "registry.new_desc": "Crea un grupo para gestionar gastos compartidos",
  "registry.name_label": "Nombre del Registro",
  "registry.name_placeholder": "Ej: Compañeros de piso",
  "registry.create": "Crear Registro",

  // --- Join ---
  "join.not_found": "Invitación no encontrada",
  "join.not_found_desc": "El código {code} no es válido o ha expirado.",
  "join.go_home": "Ir al inicio",
  "join.join_registry": "Unirse a {name}",
  "join.invited_desc": "Has sido invitado a un grupo de gastos compartidos.",
  "join.expired": "Esta invitación ha expirado.",
  "join.revoked": "Esta invitación ha sido revocada.",
  "join.max_uses": "Esta invitación ha alcanzado el máximo de usos.",
  "join.login_to_join": "Iniciar Sesión para Unirme",
  "join.create_account": "Crear Cuenta",
  "join.joining": "Uniéndote...",
  "join.join_button": "Unirme al Registro",
  "join.code_placeholder": "Código (ej: K9X2M4B7)",

  // --- Billing / Pro tier ---
  "billing.upgrade": "Mejorar a Pro",
  "billing.pro_badge": "PRO",
  "billing.grandfathered_badge": "PRO",
  "billing.upgrade_hint_owner":
    "Desbloquea miembros y plantillas ilimitadas, e historial completo.",
  "billing.upgrade_hint_member":
    "Pídele al dueño del grupo que mejore a Pro para desbloquear esto.",
  "billing.group_full":
    "Este grupo llegó al límite de miembros del plan gratuito. El dueño puede mejorarlo a Pro para invitar a más personas.",
  "billing.templates_full":
    "Este grupo llegó al límite de plantillas recurrentes del plan gratuito. El dueño puede mejorarlo a Pro para agregar más.",
  "billing.registries_full":
    "Alcanzaste el límite de 2 grupos del plan gratuito. Mejora uno a Pro o elimina un grupo para crear otro.",
  "billing.history_locked": "Cortes anteriores disponibles en Pro",
  "billing.history_locked_cta": "Desbloquear historial completo",
  "billing.monthly": "Mensual",
  "billing.yearly": "Anual",
  "billing.manage": "Administrar suscripción",
  "billing.success_title": "¡Pro activado!",
  "billing.success_desc":
    "Tu grupo ahora tiene acceso ilimitado. Todos los miembros se benefician.",
  "billing.success_pending_title": "Procesando pago…",
  "billing.success_pending_desc":
    "Tu pago está siendo confirmado. Esto puede tardar unos segundos; el Pro se activará automáticamente.",
  "billing.back_to_dashboard": "Volver al dashboard",
};
