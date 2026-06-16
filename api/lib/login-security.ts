import { isIP } from "node:net";
import { TRPCError } from "@trpc/server";
import { env } from "./env";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_IP = 10;
const ACCOUNT_LOCK_FAILURE_THRESHOLD = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;

const ipAttempts = new Map<string, number[]>();
const accountFailures = new Map<
  string,
  { count: number; firstFailureAt: number; lockedUntil?: number }
>();

function now() {
  return Date.now();
}

function pruneAttempts(attempts: number[], timestamp: number) {
  return attempts.filter(value => timestamp - value < RATE_LIMIT_WINDOW_MS);
}

type ClientIpExtractionOptions = {
  trustProxyHeaders?: boolean;
};

function isValidIpAddress(value: string | undefined): value is string {
  return Boolean(value && isIP(value) !== 0);
}

function extractRightmostForwardedIp(value: string | null) {
  const ips =
    value
      ?.split(",")
      .map(part => part.trim())
      .filter(isValidIpAddress) ?? [];
  return ips.at(-1);
}

export function extractClientIp(
  headers: Headers,
  options: ClientIpExtractionOptions = {}
): string {
  const trustProxyHeaders =
    options.trustProxyHeaders ?? env.loginTrustProxyHeaders;

  if (!trustProxyHeaders) return "unknown";

  const cfConnectingIp = headers.get("cf-connecting-ip")?.trim();
  if (isValidIpAddress(cfConnectingIp)) return cfConnectingIp;

  const realIp = headers.get("x-real-ip")?.trim();
  if (isValidIpAddress(realIp)) return realIp;

  const forwardedFor = extractRightmostForwardedIp(
    headers.get("x-forwarded-for")
  );
  if (forwardedFor) return forwardedFor;

  return "unknown";
}

export function getLoginSecurityStatus(ip: string, email: string) {
  const timestamp = now();
  const account = accountFailures.get(email);
  const attempts = pruneAttempts(ipAttempts.get(ip) ?? [], timestamp);
  ipAttempts.set(ip, attempts);

  return {
    accountLockedUntil:
      account?.lockedUntil && account.lockedUntil > timestamp
        ? account.lockedUntil
        : undefined,
  };
}

export function assertLoginAllowed(params: {
  ip: string;
  email: string;
}) {
  const timestamp = now();
  const attempts = pruneAttempts(ipAttempts.get(params.ip) ?? [], timestamp);
  ipAttempts.set(params.ip, attempts);

  if (attempts.length >= MAX_LOGIN_ATTEMPTS_PER_IP) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Troppi tentativi di accesso. Riprova più tardi.",
    });
  }

  const account = accountFailures.get(params.email);
  if (account?.lockedUntil && account.lockedUntil > timestamp) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Account temporaneamente bloccato. Riprova più tardi.",
    });
  }
}

export function recordFailedLogin(ip: string, email: string) {
  const timestamp = now();
  const attempts = pruneAttempts(ipAttempts.get(ip) ?? [], timestamp);
  attempts.push(timestamp);
  ipAttempts.set(ip, attempts);

  const current = accountFailures.get(email);
  const failureWindowExpired = current
    ? timestamp - current.firstFailureAt >= RATE_LIMIT_WINDOW_MS
    : true;
  const count = failureWindowExpired ? 1 : (current?.count ?? 0) + 1;
  accountFailures.set(email, {
    count,
    firstFailureAt: failureWindowExpired
      ? timestamp
      : (current?.firstFailureAt ?? timestamp),
    lockedUntil:
      count >= ACCOUNT_LOCK_FAILURE_THRESHOLD
        ? timestamp + ACCOUNT_LOCK_DURATION_MS
        : current?.lockedUntil,
  });
}

export function recordSuccessfulLogin(ip: string, email: string) {
  ipAttempts.delete(ip);
  accountFailures.delete(email);
}

export const loginSecurityConfig = {
  maxLoginAttemptsPerIp: MAX_LOGIN_ATTEMPTS_PER_IP,
  rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
  accountLockFailureThreshold: ACCOUNT_LOCK_FAILURE_THRESHOLD,
  accountLockDurationMs: ACCOUNT_LOCK_DURATION_MS,
} as const;

export function resetLoginSecurityStateForTests() {
  ipAttempts.clear();
  accountFailures.clear();
}
