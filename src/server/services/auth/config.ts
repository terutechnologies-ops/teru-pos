const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SESSION_TTL_MS = 12 * HOUR;
export const PERSISTENT_SESSION_TTL_MS = 30 * DAY;

// Límite de intentos fallidos de login dentro de la ventana.
export const LOGIN_WINDOW_MS = 15 * MINUTE;
export const MAX_FAILED_LOGINS_PER_ACCOUNT = 5;
export const MAX_FAILED_LOGINS_PER_IP = 20;

export const AUTH_EVENTS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGIN_BLOCKED: "LOGIN_BLOCKED",
  LOGOUT: "LOGOUT",
} as const;
