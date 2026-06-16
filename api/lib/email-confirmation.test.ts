import { describe, expect, it } from "vitest";
import {
  EMAIL_CONFIRMATION_ACTION,
  buildEmailConfirmationRedirectUrl,
  isObfuscatedExistingSupabaseUser,
  isSupabaseEmailNotConfirmedError,
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
});
