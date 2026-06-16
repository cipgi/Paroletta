import { describe, expect, it } from "vitest";
import {
  EMAIL_CONFIRMATION_ACTION,
  buildEmailConfirmationRedirectUrl,
  emailConfirmationSecurityConfig,
  hashEmailConfirmationIdentifier,
  isEmailConfirmationRateLimited,
  isObfuscatedExistingSupabaseUser,
  isSupabaseEmailNotConfirmedError,
  isSupabaseUserEmailConfirmed,
} from "./email-confirmation";
import { env } from "./env";

describe("email confirmation helpers", () => {
  it("builds a confirmation redirect from the configured app base URL", () => {
    const request = new Request("https://ignored.example.com/api/trpc");
    const baseUrl = env.appBaseUrl || "https://ignored.example.com";

    expect(buildEmailConfirmationRedirectUrl(request)).toBe(
      `${baseUrl}/login?auth_action=${EMAIL_CONFIRMATION_ACTION}`
    );
  });

  it("recognizes Supabase email confirmation failures", () => {
    expect(
      isSupabaseEmailNotConfirmedError({
        code: "email_not_confirmed",
        message: "Email not confirmed",
      })
    ).toBe(true);

    expect(
      isSupabaseEmailNotConfirmedError({
        code: "invalid_credentials",
        message: "Invalid login credentials",
      })
    ).toBe(false);
  });

  it("detects Supabase obfuscated existing-user signups", () => {
    expect(isObfuscatedExistingSupabaseUser({ identities: [] })).toBe(true);
    expect(isObfuscatedExistingSupabaseUser({ identities: [{}] })).toBe(false);
  });

  it("hashes confirmation identifiers without storing normalized input", () => {
    const hash = hashEmailConfirmationIdentifier("User@Example.com");

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashEmailConfirmationIdentifier(" user@example.com "));
    expect(hash).not.toContain("user@example.com");
  });

  it("rate limits confirmation resends by email and known client IP", () => {
    expect(
      isEmailConfirmationRateLimited({
        emailRequestCount:
          emailConfirmationSecurityConfig.maxRequestsPerEmail,
        clientIpRequestCount: 0,
        hasClientIp: false,
      })
    ).toBe(true);

    expect(
      isEmailConfirmationRateLimited({
        emailRequestCount: 0,
        clientIpRequestCount: emailConfirmationSecurityConfig.maxRequestsPerIp,
        hasClientIp: true,
      })
    ).toBe(true);

    expect(
      isEmailConfirmationRateLimited({
        emailRequestCount: 0,
        clientIpRequestCount: emailConfirmationSecurityConfig.maxRequestsPerIp,
        hasClientIp: false,
      })
    ).toBe(false);
  });

  it("recognizes confirmed Supabase users", () => {
    expect(
      isSupabaseUserEmailConfirmed({
        email_confirmed_at: "2026-06-16T10:00:00Z",
      })
    ).toBe(true);
    expect(isSupabaseUserEmailConfirmed({ confirmed_at: null })).toBe(false);
    expect(isSupabaseUserEmailConfirmed(null)).toBe(false);
  });
});
