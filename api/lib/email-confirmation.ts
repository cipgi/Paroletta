import { createHmac } from "node:crypto";
import type { TRPCError } from "@trpc/server";
import { env } from "./env";

export const EMAIL_CONFIRMATION_ACTION = "confirm-email";
export const EMAIL_CONFIRMATION_RESENT_MESSAGE =
  "Email di verifica reinviata. Apri il link nella mail, poi accedi.";
export const EMAIL_CONFIRMATION_ALREADY_CONFIRMED_MESSAGE =
  "Email già confermata. Puoi accedere.";
export const EMAIL_CONFIRMATION_NOT_FOUND_MESSAGE =
  "Account non trovato. Registrati prima di richiedere la verifica.";
export const EMAIL_CONFIRMATION_RATE_LIMITED_MESSAGE =
  "Hai richiesto troppe email di conferma. Riprova più tardi.";
export const EMAIL_CONFIRMATION_SEND_FAILED_MESSAGE =
  "Non siamo riusciti a reinviare l'email di verifica. Riprova più tardi.";

const EMAIL_CONFIRMATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAIL_CONFIRMATION_REQUESTS_PER_EMAIL = 5;
const MAX_EMAIL_CONFIRMATION_REQUESTS_PER_IP = 30;

type EmailConfirmationRateLimitInput = {
  emailRequestCount: number;
  clientIpRequestCount: number;
  hasClientIp: boolean;
};

export function buildEmailConfirmationRedirectUrl(request: Request) {
  const baseUrl = env.appBaseUrl || new URL(request.url).origin;
  const redirectUrl = new URL("login", `${baseUrl.replace(/\/+$/, "")}/`);
  redirectUrl.searchParams.set("auth_action", EMAIL_CONFIRMATION_ACTION);
  return redirectUrl.toString();
}

export function isSupabaseEmailNotConfirmedError(error: unknown) {
  const maybeError = error as { code?: string; message?: string } | null;
  const code = maybeError?.code?.toLowerCase();
  const message = maybeError?.message?.toLowerCase() ?? "";

  return (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed") ||
    message.includes("not confirmed")
  );
}

export function isObfuscatedExistingSupabaseUser(
  user: { identities?: unknown[] | null } | null
) {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}

export function isSupabaseUserEmailConfirmed(
  user: { email_confirmed_at?: string | null; confirmed_at?: string | null } | null
) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export function getEmailConfirmationWindowStart() {
  return new Date(Date.now() - EMAIL_CONFIRMATION_WINDOW_MS).toISOString();
}

export function hashEmailConfirmationIdentifier(value: string) {
  return createHmac("sha256", env.sessionSecret)
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export function isEmailConfirmationRateLimited(
  input: EmailConfirmationRateLimitInput
) {
  if (
    input.emailRequestCount >= MAX_EMAIL_CONFIRMATION_REQUESTS_PER_EMAIL
  ) {
    return true;
  }

  return (
    input.hasClientIp &&
    input.clientIpRequestCount >= MAX_EMAIL_CONFIRMATION_REQUESTS_PER_IP
  );
}

export function getEmailConfirmationFailureCode(error: unknown) {
  const maybeError = error as Partial<TRPCError> & {
    code?: unknown;
    status?: unknown;
    name?: unknown;
  };

  if (typeof maybeError.code === "string") {
    return maybeError.code.slice(0, 80);
  }

  if (typeof maybeError.status === "number") {
    return `status_${maybeError.status}`;
  }

  if (typeof maybeError.name === "string") {
    return maybeError.name.slice(0, 80);
  }

  return "unknown";
}

export const emailConfirmationSecurityConfig = {
  windowMs: EMAIL_CONFIRMATION_WINDOW_MS,
  maxRequestsPerEmail: MAX_EMAIL_CONFIRMATION_REQUESTS_PER_EMAIL,
  maxRequestsPerIp: MAX_EMAIL_CONFIRMATION_REQUESTS_PER_IP,
} as const;
