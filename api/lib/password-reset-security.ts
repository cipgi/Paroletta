import { createHmac } from "node:crypto";
import type { TRPCError } from "@trpc/server";
import { env } from "./env";

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Se l'email è registrata, riceverai un link per reimpostare la password.";

const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;
const MAX_PASSWORD_RESET_REQUESTS_PER_EMAIL = 3;
const MAX_PASSWORD_RESET_REQUESTS_PER_IP = 20;

type PasswordResetRateLimitInput = {
  emailRequestCount: number;
  clientIpRequestCount: number;
  hasClientIp: boolean;
};

export function buildPasswordResetRedirectUrl(request: Request) {
  const baseUrl = env.appBaseUrl || new URL(request.url).origin;
  return new URL(
    "reset-password",
    `${baseUrl.replace(/\/+$/, "")}/`
  ).toString();
}

export function getPasswordResetWindowStart() {
  return new Date(Date.now() - PASSWORD_RESET_WINDOW_MS).toISOString();
}

export function hashPasswordResetIdentifier(value: string) {
  return createHmac("sha256", env.sessionSecret)
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export function isPasswordResetRateLimited(input: PasswordResetRateLimitInput) {
  if (input.emailRequestCount >= MAX_PASSWORD_RESET_REQUESTS_PER_EMAIL) {
    return true;
  }

  return (
    input.hasClientIp &&
    input.clientIpRequestCount >= MAX_PASSWORD_RESET_REQUESTS_PER_IP
  );
}

export function getPasswordResetFailureCode(error: unknown) {
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

export const passwordResetSecurityConfig = {
  windowMs: PASSWORD_RESET_WINDOW_MS,
  maxRequestsPerEmail: MAX_PASSWORD_RESET_REQUESTS_PER_EMAIL,
  maxRequestsPerIp: MAX_PASSWORD_RESET_REQUESTS_PER_IP,
} as const;
