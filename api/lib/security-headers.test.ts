import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  securityHeaders,
} from "./security-headers";

function createApp(cspMode?: "off" | "report-only" | "enforce") {
  const app = new Hono();
  app.use("*", securityHeaders({ cspMode, isProduction: true }));
  app.get("/health", c => c.text("ok"));
  return app;
}

describe("security headers", () => {
  it("adds the baseline HTTP security headers without enforcing CSP by default", async () => {
    const response = await createApp().request("/health");

    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(), geolocation=(), microphone=(), payment=()"
    );
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin"
    );
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "same-origin"
    );
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(
      response.headers.get("Content-Security-Policy-Report-Only")
    ).toBeNull();
  });

  it("can publish the customized CSP in report-only mode", async () => {
    const response = await createApp("report-only").request("/health");

    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBe(
      buildContentSecurityPolicy(true)
    );
  });

  it("can enforce the customized CSP after the allowlist has been validated", async () => {
    const response = await createApp("enforce").request("/health");

    expect(response.headers.get("Content-Security-Policy")).toBe(
      buildContentSecurityPolicy(true)
    );
    expect(
      response.headers.get("Content-Security-Policy-Report-Only")
    ).toBeNull();
  });

  it("builds a production CSP with Paroletta allowlisted services", () => {
    const policy = buildContentSecurityPolicy(true);

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("https://*.supabase.co");
    expect(policy).toContain("wss://*.supabase.co");
    expect(policy).toContain("https://api.openai.com");
    expect(policy).toContain("https://accounts.google.com");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("omits CSP HTTPS upgrades outside production to keep local development usable", () => {
    expect(buildContentSecurityPolicy(false)).not.toContain(
      "upgrade-insecure-requests"
    );
  });
});
