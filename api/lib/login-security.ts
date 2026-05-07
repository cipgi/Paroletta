import { TRPCError } from "@trpc/server";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_IP = 10;
const CAPTCHA_FAILURE_THRESHOLD = 3;
const ACCOUNT_LOCK_FAILURE_THRESHOLD = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

const ipAttempts = new Map<string, number[]>();
const accountFailures = new Map<
  string,
  { count: number; firstFailureAt: number; lockedUntil?: number }
>();
const captchaChallenges = new Map<
  string,
  { answer: string; expiresAt: number; used: boolean }
>();

function now() {
  return Date.now();
}

function pruneAttempts(attempts: number[], timestamp: number) {
  return attempts.filter(value => timestamp - value < RATE_LIMIT_WINDOW_MS);
}

function pruneCaptchaChallenges(timestamp: number) {
  for (const [id, challenge] of captchaChallenges.entries()) {
    if (challenge.expiresAt <= timestamp || challenge.used) {
      captchaChallenges.delete(id);
    }
  }
}

export function extractClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfConnectingIp = headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  return "unknown";
}

export function buildLoginCaptcha() {
  const timestamp = now();
  pruneCaptchaChallenges(timestamp);

  const left = Math.floor(Math.random() * 8) + 2;
  const right = Math.floor(Math.random() * 8) + 2;
  const id = crypto.randomUUID();
  captchaChallenges.set(id, {
    answer: String(left + right),
    expiresAt: timestamp + CAPTCHA_TTL_MS,
    used: false,
  });

  return {
    id,
    question: `Quanto fa ${left} + ${right}?`,
    expiresInSeconds: CAPTCHA_TTL_MS / 1000,
  };
}

export function getLoginSecurityStatus(ip: string, email: string) {
  const timestamp = now();
  const account = accountFailures.get(email);
  const attempts = pruneAttempts(ipAttempts.get(ip) ?? [], timestamp);
  ipAttempts.set(ip, attempts);

  return {
    captchaRequired:
      attempts.length >= CAPTCHA_FAILURE_THRESHOLD ||
      (account?.count ?? 0) >= CAPTCHA_FAILURE_THRESHOLD,
    accountLockedUntil:
      account?.lockedUntil && account.lockedUntil > timestamp
        ? account.lockedUntil
        : undefined,
  };
}

export function assertLoginAllowed(params: {
  ip: string;
  email: string;
  captchaChallengeId?: string;
  captchaAnswer?: string;
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

  const captchaRequired =
    attempts.length >= CAPTCHA_FAILURE_THRESHOLD ||
    (account?.count ?? 0) >= CAPTCHA_FAILURE_THRESHOLD;
  if (!captchaRequired) return;

  const challengeId = params.captchaChallengeId?.trim();
  const answer = params.captchaAnswer?.trim();
  const challenge = challengeId
    ? captchaChallenges.get(challengeId)
    : undefined;

  if (
    !challenge ||
    challenge.used ||
    challenge.expiresAt <= timestamp ||
    !answer ||
    answer !== challenge.answer
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "CAPTCHA richiesto o non valido.",
    });
  }

  challenge.used = true;
  captchaChallenges.delete(challengeId!);
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
  captchaFailureThreshold: CAPTCHA_FAILURE_THRESHOLD,
  accountLockFailureThreshold: ACCOUNT_LOCK_FAILURE_THRESHOLD,
  accountLockDurationMs: ACCOUNT_LOCK_DURATION_MS,
} as const;

export function resetLoginSecurityStateForTests() {
  ipAttempts.clear();
  accountFailures.clear();
  captchaChallenges.clear();
}
