const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SESSION_TTL_MS = 12 * HOUR;
export const PERSISTENT_SESSION_TTL_MS = 30 * DAY;

// Límite de intentos fallidos de login dentro de la ventana.
export const LOGIN_WINDOW_MS = 15 * MINUTE;
export const MAX_FAILED_LOGINS_PER_ACCOUNT = 5;
export const MAX_FAILED_LOGINS_PER_IP = 20;

// Cambio de la propia contraseña: contraseñas actuales incorrectas
// permitidas dentro de la ventana (con una sesión abierta no se debe poder
// adivinar la contraseña).
export const PASSWORD_CHANGE_WINDOW_MS = 15 * MINUTE;
export const MAX_FAILED_PASSWORD_CHANGES = 5;

export const RESET_TOKEN_TTL_MS = 20 * MINUTE;
export const RESET_WINDOW_MS = 15 * MINUTE;
export const MAX_RESET_REQUESTS_PER_ACCOUNT = 3;
export const MAX_RESET_REQUESTS_PER_IP = 10;

export const AUTH_EVENTS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGIN_BLOCKED: "LOGIN_BLOCKED",
  LOGOUT: "LOGOUT",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_BLOCKED: "PASSWORD_RESET_BLOCKED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
  // Cambio de la propia contraseña desde "Mi cuenta".
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_CHANGE_FAILED: "PASSWORD_CHANGE_FAILED",
  PASSWORD_CHANGE_BLOCKED: "PASSWORD_CHANGE_BLOCKED",
} as const;

export const STAFF_INVITATION_TTL_MS = 72 * HOUR;

export const STAFF_EVENTS = {
  INVITATION_CREATED: "STAFF_INVITATION_CREATED",
  INVITATION_RESENT: "STAFF_INVITATION_RESENT",
  INVITATION_REVOKED: "STAFF_INVITATION_REVOKED",
  INVITATION_ACCEPTED: "STAFF_INVITATION_ACCEPTED",
  MEMBER_DEACTIVATED: "STAFF_MEMBER_DEACTIVATED",
  MEMBER_REACTIVATED: "STAFF_MEMBER_REACTIVATED",
} as const;

// Catálogo: se registran con el producto afectado (target PRODUCT).
export const PRODUCT_EVENTS = {
  CREATED: "PRODUCT_CREATED",
  UPDATED: "PRODUCT_UPDATED",
  // Además de UPDATED, para poder filtrar los cambios de precio.
  PRICE_CHANGED: "PRODUCT_PRICE_CHANGED",
  ARCHIVED: "PRODUCT_ARCHIVED",
  RESTORED: "PRODUCT_RESTORED",
  AVAILABILITY_CHANGED: "PRODUCT_AVAILABILITY_CHANGED",
  IMAGE_UPDATED: "PRODUCT_IMAGE_UPDATED",
  IMAGE_REMOVED: "PRODUCT_IMAGE_REMOVED",
  // Agregar, cambiar o quitar un insumo de la receta (afecta el costo).
  RECIPE_CHANGED: "PRODUCT_RECIPE_CHANGED",
} as const;

// Insumos: solo el costo se audita (bodegas e insumos no; los movimientos
// son su propio registro). Sin valores: quién y cuándo, con el insumo.
export const SUPPLY_EVENTS = {
  COST_CHANGED: "SUPPLY_COST_CHANGED",
} as const;

// Métodos de pago: con el método afectado (target PAYMENT_METHOD). El orden
// no se audita.
export const PAYMENT_METHOD_EVENTS = {
  CREATED: "PAYMENT_METHOD_CREATED",
  RENAMED: "PAYMENT_METHOD_RENAMED",
  ACTIVATED: "PAYMENT_METHOD_ACTIVATED",
  DEACTIVATED: "PAYMENT_METHOD_DEACTIVATED",
} as const;

export const COMPANY_EVENTS = {
  // Alta (script o panel Teru); desactivar y reactivar, desde el panel Teru.
  CREATED: "COMPANY_CREATED",
  DEACTIVATED: "COMPANY_DEACTIVATED",
  REACTIVATED: "COMPANY_REACTIVATED",
  SETUP_COMPLETED: "COMPANY_SETUP_COMPLETED",
  PROFILE_UPDATED: "COMPANY_PROFILE_UPDATED",
  LOGO_UPDATED: "COMPANY_LOGO_UPDATED",
  LOGO_REMOVED: "COMPANY_LOGO_REMOVED",
  REPORT_RECIPIENTS_UPDATED: "COMPANY_REPORT_RECIPIENTS_UPDATED",
} as const;

// Equipo Teru (panel /teru): sesión de 8 h sin "recordar" (deslizante,
// como la del personal). El límite de intentos usa los mismos números que el
// login del personal, con sus propios eventos: los fallos de un login no
// cuentan para el otro.
export const PLATFORM_SESSION_TTL_MS = 8 * HOUR;

// Las cuentas las crea y restablece el script teru:create-admin (actor
// SYSTEM, sin empresa; target PLATFORM_USER). Los eventos de sesión van con
// actor PLATFORM y sin empresa.
export const PLATFORM_USER_TARGET = "PLATFORM_USER";

export const PLATFORM_EVENTS = {
  USER_CREATED: "PLATFORM_USER_CREATED",
  PASSWORD_RESET: "PLATFORM_PASSWORD_RESET",
  USER_DEACTIVATED: "PLATFORM_USER_DEACTIVATED",
  USER_ACTIVATED: "PLATFORM_USER_ACTIVATED",
  LOGIN_SUCCESS: "PLATFORM_LOGIN_SUCCESS",
  LOGIN_FAILED: "PLATFORM_LOGIN_FAILED",
  LOGIN_BLOCKED: "PLATFORM_LOGIN_BLOCKED",
  LOGOUT: "PLATFORM_LOGOUT",
} as const;
