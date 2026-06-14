import { describe, expect, it } from "vitest";
import {
  buildPasswordResetRedirectUrl,
  hashPasswordResetIdentifier,
  isPasswordResetRateLimited,
  passwordResetSecurityConfig,
} from "./password-reset-security";
import { env } from "./env";

describe("password reset security helpers", () => {
  it("builds a reset redirect from the configured app base URL", () => {
    const request = new Request("https://ignored.example.com/api/trpc");
    const baseUrl = env.appBaseUrl || "https://ignored.example.com";

    expect(buildPasswordResetRedirectUrl(request)).toBe(
      `${baseUrl}/reset-password`
    );
  });

  it("hashes reset identifiers without storing normalized input", () => {
    const hash = hashPasswordResetIdentifier("User@Example.com");

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashPasswordResetIdentifier(" user@example.com "));
    expect(hash).not.toContain("user@example.com");
  });

  it("rate limits by email and by known client IP", () => {
    expect(
      isPasswordResetRateLimited({
        emailRequestCount: passwordResetSecurityConfig.maxRequestsPerEmail,
        clientIpRequestCount: 0,
        hasClientIp: false,
      })
    ).toBe(true);

    expect(
      isPasswordResetRateLimited({
        emailRequestCount: 0,
        clientIpRequestCount: passwordResetSecurityConfig.maxRequestsPerIp,
        hasClientIp: true,
      })
    ).toBe(true);

    expect(
      isPasswordResetRateLimited({
        emailRequestCount: 0,
        clientIpRequestCount: passwordResetSecurityConfig.maxRequestsPerIp,
        hasClientIp: false,
      })
    ).toBe(false);
  });
});
