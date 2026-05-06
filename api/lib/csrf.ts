import * as cookie from "cookie";
import { timingSafeEqual } from "node:crypto";
import { Csrf, ErrorMessages } from "@contracts/constants";
import { TRPCError } from "@trpc/server";
import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function getCsrfCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);

  return {
    httpOnly: false,
    path: "/",
    sameSite: "Lax",
    secure: !localhost,
  };
}

export function parseCsrfCookie(headers: Headers): string | undefined {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return undefined;
  return cookie.parse(cookieHeader)[Csrf.cookieName];
}

function hasValidTokenShape(token: string | undefined): token is string {
  return typeof token === "string" && token.length >= Csrf.minTokenLength;
}

function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function validateSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

export function assertValidCsrfRequest(req: Request): void {
  if (!validateSameOrigin(req)) {
    throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.csrf });
  }

  const cookieToken = parseCsrfCookie(req.headers);
  const headerToken = req.headers.get(Csrf.headerName) ?? undefined;

  if (
    !hasValidTokenShape(cookieToken) ||
    !hasValidTokenShape(headerToken) ||
    !tokensMatch(cookieToken, headerToken)
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.csrf });
  }
}
