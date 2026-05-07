import type { MiddlewareHandler } from "hono";

export type CspMode = "off" | "report-only" | "enforce";

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://accounts.google.com",
  "font-src 'self' data:",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
];

export function buildContentSecurityPolicy(isProduction: boolean) {
  return [
    ...cspDirectives,
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function securityHeaders(
  options: { cspMode?: CspMode; isProduction?: boolean } = {}
): MiddlewareHandler {
  const contentSecurityPolicy = buildContentSecurityPolicy(
    Boolean(options.isProduction)
  );
  const cspMode = options.cspMode ?? "off";

  return async (c, next) => {
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
    c.header("X-Frame-Options", "DENY");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header(
      "Permissions-Policy",
      "camera=(), geolocation=(), microphone=(), payment=()"
    );
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Cross-Origin-Resource-Policy", "same-origin");

    if (cspMode === "report-only") {
      c.header("Content-Security-Policy-Report-Only", contentSecurityPolicy);
    }

    if (cspMode === "enforce") {
      c.header("Content-Security-Policy", contentSecurityPolicy);
    }

    await next();
  };
}
