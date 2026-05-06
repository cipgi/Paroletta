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

function firstForwardedValue(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

function stripForwardedQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}

function parseForwardedHeader(headers: Headers): {
  host?: string;
  proto?: string;
} {
  const forwarded = firstForwardedValue(headers.get("forwarded"));
  if (!forwarded) return {};

  return forwarded
    .split(";")
    .reduce<{ host?: string; proto?: string }>((acc, part) => {
      const [rawKey, ...rawValue] = part.split("=");
      const key = rawKey?.trim().toLowerCase();
      const value = stripForwardedQuotes(rawValue.join("=").trim());
      if (key === "host" && value) acc.host = value;
      if (key === "proto" && value) acc.proto = value;
      return acc;
    }, {});
}

function getRequestOrigin(req: Request): string {
  const forwarded = parseForwardedHeader(req.headers);
  const forwardedHost =
    forwarded.host ?? firstForwardedValue(req.headers.get("x-forwarded-host"));
  const forwardedProto =
    forwarded.proto ??
    firstForwardedValue(req.headers.get("x-forwarded-proto"));

  if (forwardedHost && forwardedProto) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(req.url).origin;
}

function validateSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(getRequestOrigin(req)).origin;
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
