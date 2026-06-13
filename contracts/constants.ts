export const Session = {
  cookieName: "session_id",
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
} as const;

export const PasswordPolicy = {
  minLength: 8,
  alphanumericPattern: /^[A-Za-z0-9]+$/,
  minLengthMessage: "La password deve contenere almeno 8 caratteri.",
  alphanumericMessage: "La password deve contenere solo lettere e numeri.",
  helpText: "Minimo 8 caratteri, solo lettere e numeri.",
} as const;

export const TeamLimits = {
  maxSeats: 4,
  maxStaffAccounts: 3,
} as const;

export const SubscriptionPlanLimits = {
  trial: { sheetLimit: 15, imageLimit: 15 },
  sviluppo: { sheetLimit: 0, imageLimit: 0 },
  nessun_abbonamento: { sheetLimit: 0, imageLimit: 0 },
  starter: { sheetLimit: 25, imageLimit: 25 },
  pro: { sheetLimit: 100, imageLimit: 100 },
  max: { sheetLimit: 100, imageLimit: 300 },
} as const;
