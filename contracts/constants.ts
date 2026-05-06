export const Session = {
  cookieName: "session_id",
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const Csrf = {
  cookieName: "csrf_token",
  headerName: "x-csrf-token",
  minTokenLength: 32,
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
  csrf: "Invalid CSRF token",
} as const;

export const Paths = {
  login: "/login",
} as const;
