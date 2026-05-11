import { describe, expect, it } from "vitest";
import { getMissingProductionEnvVars } from "./env";

describe("getMissingProductionEnvVars", () => {
  it("requires the Supabase service-role key for production admin queries", () => {
    expect(
      getMissingProductionEnvVars({
        isProduction: true,
        securityCspMode: "off",
        sessionSecret: "secret",
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: "publishable-key",
        supabaseServiceRoleKey: "",
      })
    ).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  });

  it("accepts either SUPABASE_PUBLISHABLE_KEY or the legacy anon key value once resolved", () => {
    expect(
      getMissingProductionEnvVars({
        isProduction: true,
        securityCspMode: "off",
        sessionSecret: "secret",
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: "anon-or-publishable-key",
        supabaseServiceRoleKey: "service-role-key",
      })
    ).toEqual([]);
  });
});
