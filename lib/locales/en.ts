/**
 * English translation dictionary.
 *
 * Keys match lib/locales/es.ts exactly. Phase 1: auth, landing, dashboard core.
 */
export const en: Record<string, string> = {
  // --- Common ---
  "common.loading": "Loading...",
  "common.saving": "Saving...",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.close": "Close",
  "common.create": "Create",
  "common.error_connection": "Connection error",
  "common.error_unknown": "Unknown error",
  "common.you_label": "(You)",
  "common.tercero_badge": "third-party",

  // --- App / page titles ---
  "app.name": "A la Par",
  "app.tagline":
    "The easiest way to split expenses with friends, family, or travel buddies.",

  // --- Landing page ---
  "landing.new_registry": "New group",
  "landing.new_registry_desc":
    "Create a new expense group for your next trip or event.",
  "landing.start": "Get started",
  "landing.join_registry": "Join a group",
  "landing.join_registry_desc":
    "Enter an invite code to join an existing group.",
  "landing.copyright": "© 2024 A la Par. Transparent finances.",

  // --- Auth ---
  "auth.login": "Log in",
  "auth.login_subtitle": "Sign in to your A la Par account",
  "auth.signup": "Sign up",
  "auth.signup_subtitle": "Create an account to start splitting expenses",
  "auth.forgot_password": "Reset password",
  "auth.forgot_password_subtitle":
    "Enter your email and we'll send you a link to reset it",
  "auth.reset_password": "New password",
  "auth.reset_password_subtitle": "Enter your new password",
  "auth.name": "Name",
  "auth.name_placeholder": "Your name",
  "auth.email": "Email",
  "auth.email_placeholder": "you@email.com",
  "auth.password": "Password",
  "auth.show_password": "Show password",
  "auth.hide_password": "Hide password",
  "auth.google": "Continue with Google",
  "auth.or": "or",
  "auth.forgot_link": "Forgot your password?",
  "auth.no_account": "Don't have an account?",
  "auth.signup_link": "Sign up",
  "auth.has_account": "Already have an account?",
  "auth.login_link": "Log in",
  "auth.check_email": "Check your email to confirm your account.",
  "auth.session_error": "Error saving session",

  // --- Forgot password ---
  "forgot.submit": "Send recovery link",
  "forgot.sending": "Sending...",
  "forgot.back_login": "Back to log in",
  "forgot.success":
    "We sent you an email with the link to reset your password.",

  // --- Reset password ---
  "reset.new_password": "New password",
  "reset.confirm_password": "Confirm password",
  "reset.submit": "Reset password",
  "reset.updating": "Updating...",
  "reset.success": "Your password was updated successfully.",
  "reset.invalid_link": "Invalid or expired recovery link. Request a new one.",
  "reset.session_failed":
    "Could not establish session. The link may have expired.",
  "reset.password_too_short": "Password must be at least 6 characters.",
  "reset.password_mismatch": "Passwords don't match.",
  "reset.request_new": "Request a new link",
  "reset.verifying": "Verifying link...",

  // --- Auth callback ---
  "auth_callback.title": "A la Par - Authenticating",
  "auth_callback.authenticating": "Authenticating...",
  "auth_callback.no_tokens": "No authentication tokens received.",
  "auth_callback.auth_failed": "Could not complete authentication.",
  "auth_callback.technical_details": "Technical details",
  "auth_callback.back_login": "Back to log in",

  // --- Balance ---
  "balance.total": "Total Balance",
  "balance.breakdown_title": "Breakdown by person",
  "balance.breakdown_subtitle": "Balance details with each member",
  "balance.all_settled": "Everyone is settled up",
  "balance.owed_to_you": "Owes you",
  "balance.you_owe": "You owe",

  // --- Transaction list ---
  "tx.current_period": "Current period",
  "tx.current_period_filtered": "Current period (paid by {name})",
  "tx.all": "All",
  "tx.search_placeholder": "Search transaction...",
  "tx.empty_title": "No transactions",
  "tx.empty_desc": "Add an expense or payment",
  "tx.no_results": "No transactions found with these filters.",
  "tx.clear_filters": "Clear filters",
  "tx.add_expense_mobile": "Expense",
  "tx.add_payment_mobile": "Payment",
  "tx.add_expense_tooltip": "Add expense",
  "tx.add_payment_tooltip": "Add payment",
  "tx.paid_by_you": "You paid",
  "tx.paid_by_other": "{name} paid",
  "tx.paid_to": "You paid {name}",
  "tx.received_from": "{name} paid you",
  "tx.of_total": "of {total}",
  "tx.notification_title": "New transaction",
  "tx.notification_body": "New transaction",
  "tx.badge_payment": "Payment",
  "tx.badge_adjustment": "Pending balance",
  "tx.badge_installment": "{current}/{total}",
  "tx.single_user_title": "It's lonely here",
  "tx.single_user_desc":
    "Make sure to invite other users or create a third-party",
  "tx.tercero_tooltip":
    "A third-party is an entity different from you that won't register as a user, for example: a bank!",

  // --- Transaction modal ---
  "modal.new_expense": "New Expense",
  "modal.edit_expense": "Edit Expense",
  "modal.new_expense_subtitle": "Configure how to split this expense.",
  "modal.edit_expense_subtitle": "Edit the expense details.",
  "modal.new_payment": "New Payment",
  "modal.edit_payment": "Edit Payment",
  "modal.new_payment_subtitle": "Register a payment between users.",
  "modal.edit_payment_subtitle": "Edit the payment details.",
  "modal.description": "Description",
  "modal.description_expense_placeholder": "e.g. Weekly groceries",
  "modal.description_payment_placeholder": "e.g. Balance payment",
  "modal.amount_total": "Total Amount",
  "modal.amount_payment": "Payment Amount",
  "modal.amount_installment": "Per-installment Amount",
  "modal.type": "Type",
  "type.unico": "One-time",
  "type.parcialidad": "Installment",
  "type.recurrente": "Recurring",
  "modal.installment_mode_total": "Total Amount",
  "modal.installment_mode_per": "Per-installment Amount",
  "modal.installment_current": "Current Installment",
  "modal.installment_of": "of",
  "modal.installment_months": "months",
  "modal.installment_count": "{n} installments",
  "modal.payer": "Paid by",
  "modal.notes": "Notes (optional)",
  "modal.notes_placeholder": "Additional notes...",
  "modal.pay_debt": "The {amount} owed",
  "modal.transfer_section": "Transfer",
  "modal.user_header": "USER",
  "modal.paid_header": "Paid",
  "modal.received_header": "Received",
  "modal.balance_header": "BALANCE",
  "modal.owes_you": "Owes you {amount}",
  "modal.you_owe_them": "You owe {amount}",
  "modal.link_expenses": "Link this payment to existing expenses",
  "modal.link_expenses_tooltip":
    "You can only link payments when you have a balance to pay!",
  "modal.search_expense": "Search expense...",
  "modal.no_expenses_found": "No expenses found.",
  "modal.paid_by_name": "Paid by {name}",
  "modal.allocation_fully_covered": "Fully covered",
  "modal.allocation_partial": "Covering {covered} of {total}",
  "modal.allocation_unassigned": "Unassigned",
  "modal.allocation_expense": "Expense",
  "modal.allocation_section": "Allocation",
  "modal.split_section": "Split",
  "modal.split_auto": "Auto",
  "modal.split_percentage": "Percentage",
  "modal.split_fixed": "Fixed Amount",
  "modal.amount_header": "AMOUNT",
  "modal.total_header": "TOTAL",
  "modal.delete_confirm": "Delete this transaction?",
  "modal.unknown_payer": "Unknown",
  "modal.default_payment_desc": "Payment",

  // --- Registries ---
  "registry.new": "New Group",
  "registry.new_desc": "Create a group to manage shared expenses",
  "registry.name_label": "Group Name",
  "registry.name_placeholder": "e.g. Roommates",
  "registry.create": "Create Group",

  // --- Join ---
  "join.not_found": "Invitation not found",
  "join.not_found_desc": "The code {code} is not valid or has expired.",
  "join.go_home": "Go home",
  "join.join_registry": "Join {name}",
  "join.invited_desc": "You've been invited to a shared expense group.",
  "join.expired": "This invitation has expired.",
  "join.revoked": "This invitation has been revoked.",
  "join.max_uses": "This invitation has reached the maximum uses.",
  "join.login_to_join": "Log in to Join",
  "join.create_account": "Create Account",
  "join.joining": "Joining...",
  "join.join_button": "Join Group",
  "join.code_placeholder": "Code (e.g. K9X2M4B7)",

  // --- Billing / Pro tier ---
  "billing.upgrade": "Upgrade to Pro",
  "billing.pro_badge": "PRO",
  "billing.grandfathered_badge": "PRO",
  "billing.upgrade_hint_owner":
    "Unlock unlimited members and templates, plus full history.",
  "billing.upgrade_hint_member":
    "Ask the group owner to upgrade to Pro to unlock this.",
  "billing.group_full":
    "This group reached the free plan's member limit. The owner can upgrade to Pro to invite more people.",
  "billing.templates_full":
    "This group reached the free plan's recurring-template limit. The owner can upgrade to Pro to add more.",
  "billing.registries_full":
    "You reached the free plan's limit of 2 groups. Upgrade one to Pro or delete a group to create another.",
  "billing.history_locked": "Older cuts available in Pro",
  "billing.history_locked_cta": "Unlock full history",
  "billing.monthly": "Monthly",
  "billing.yearly": "Yearly",
  "billing.manage": "Manage subscription",
  "billing.success_title": "Pro activated!",
  "billing.success_desc":
    "Your group now has unlimited access. Every member benefits.",
  "billing.success_pending_title": "Processing payment…",
  "billing.success_pending_desc":
    "Your payment is being confirmed. This can take a few seconds; Pro will activate automatically.",
  "billing.back_to_dashboard": "Back to dashboard",
};
