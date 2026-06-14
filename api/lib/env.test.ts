import { describe, expect, it } from "vitest";
import { getMissingProductionEnvVars } from "./env";

describe("getMissingProductionEnvVars", () => {
  it("requires the Supabase service-role key for production admin queries", () => {
    expect(
      getMissingProductionEnvVars({
        isProduction: true,
        securityCspMode: "off",
        sessionSecret: "a-production-session-secret-32-chars",
        loginTrustProxyHeaders: false,
        appBaseUrl: "https://app.example.com",
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: "publishable-key",
        supabaseServiceRoleKey: "",
      })
    ).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  });

  it("requires a production session secret that is not the development fallback", () => {
    expect(
      getMissingProductionEnvVars({
        isProduction: true,
        securityCspMode: "off",
        sessionSecret: "dev-session-secret",
        loginTrustProxyHeaders: false,
        appBaseUrl: "https://app.example.com",
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: "publishable-key",
        supabaseServiceRoleKey: "service-role-key",
      })
    ).toEqual(["SESSION_SECRET (at least 32 characters)"]);
  });

  it("accepts either SUPABASE_PUBLISHABLE_KEY or the legacy anon key value once resolved", () => {
    expect(
      getMissingProductionEnvVars({
        isProduction: true,
        securityCspMode: "off",
        sessionSecret: "a-production-session-secret-32-chars",
        loginTrustProxyHeaders: false,
        appBaseUrl: "https://app.example.com",
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: "anon-or-publishable-key",
        supabaseServiceRoleKey: "service-role-key",
      })
    ).toEqual([]);
  });

  it("requires an HTTPS app base URL for password reset redirects", () => {
    expect(
      getMissingProductionEnvVars({
        isProduction: true,
        securityCspMode: "off",
        sessionSecret: "a-production-session-secret-32-chars",
        loginTrustProxyHeaders: false,
        appBaseUrl: "http://app.example.com",
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: "publishable-key",
        supabaseServiceRoleKey: "service-role-key",
      })
    ).toEqual(["APP_BASE_URL (absolute HTTPS URL)"]);
  });
});
