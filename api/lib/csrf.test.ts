import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { Csrf, ErrorMessages } from "@contracts/constants";
import { assertValidCsrfRequest } from "./csrf";

const token = "a".repeat(Csrf.minTokenLength);

function requestWithCsrf({
  cookieToken = token,
  headerToken = token,
  origin = "https://app.example.com",
}: {
  cookieToken?: string;
  headerToken?: string;
  origin?: string;
} = {}) {
  return new Request("https://app.example.com/api/trpc/patients.create", {
    method: "POST",
    headers: {
      cookie: `${Csrf.cookieName}=${cookieToken}`,
      [Csrf.headerName]: headerToken,
      origin,
    },
  });
}

describe("CSRF validation", () => {
  it("accepts same-origin requests with matching double-submit tokens", () => {
    expect(() => assertValidCsrfRequest(requestWithCsrf())).not.toThrow();
  });

  it("rejects requests with missing or mismatched double-submit tokens", () => {
    expect(() =>
      assertValidCsrfRequest(
        requestWithCsrf({ headerToken: "b".repeat(Csrf.minTokenLength) })
      )
    ).toThrow(
      new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.csrf })
    );
  });

  it("rejects cross-origin requests even when tokens match", () => {
    expect(() =>
      assertValidCsrfRequest(
        requestWithCsrf({ origin: "https://evil.example" })
      )
    ).toThrow(
      new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.csrf })
    );
  });

  it("accepts same-origin requests behind an HTTPS reverse proxy", () => {
    const request = requestWithCsrf();
    request.headers.set("origin", "https://app.example.com");

    expect(() =>
      assertValidCsrfRequest(
        new Request("http://internal:3000/api/trpc/auth.loginWithCredentials", {
          method: "POST",
          headers: request.headers,
        })
      )
    ).toThrow(
      new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.csrf })
    );

    request.headers.set("x-forwarded-proto", "https");
    request.headers.set("x-forwarded-host", "app.example.com");

    expect(() =>
      assertValidCsrfRequest(
        new Request("http://internal:3000/api/trpc/auth.loginWithCredentials", {
          method: "POST",
          headers: request.headers,
        })
      )
    ).not.toThrow();
  });

  it("accepts standard Forwarded headers from reverse proxies", () => {
    const request = requestWithCsrf();
    request.headers.set("origin", "https://app.example.com");
    request.headers.set(
      "forwarded",
      "for=192.0.2.1;proto=https;host=app.example.com"
    );

    expect(() =>
      assertValidCsrfRequest(
        new Request("http://internal:3000/api/trpc/auth.loginWithCredentials", {
          method: "POST",
          headers: request.headers,
        })
      )
    ).not.toThrow();
  });
});
