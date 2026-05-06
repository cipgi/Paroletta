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
});
