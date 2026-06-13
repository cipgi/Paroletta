import "dotenv/config";

const cspModeValues = ["off", "report-only", "enforce"] as const;
export type CspMode = (typeof cspModeValues)[number];
const DEFAULT_DEV_SESSION_SECRET = "dev-session-secret";
const MIN_PRODUCTION_SESSION_SECRET_LENGTH = 32;

function isCspMode(value: string | undefined): value is CspMode {
  return cspModeValues.some(mode => mode === value);
}

function getCspMode(): CspMode {
  const configuredMode = process.env.SECURITY_CSP_MODE;
  if (isCspMode(configuredMode)) return configuredMode;
  return "off";
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  securityCspMode: getCspMode(),
  sessionSecret: process.env.SESSION_SECRET ?? DEFAULT_DEV_SESSION_SECRET,
  loginTrustProxyHeaders: process.env.LOGIN_TRUST_PROXY_HEADERS === "true",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

export const supabaseConfigured = Boolean(
  env.supabaseUrl && env.supabasePublishableKey
);

export const supabaseAdminConfigured = Boolean(
  env.supabaseUrl && env.supabaseServiceRoleKey
);

export function getMissingProductionEnvVars(config = env) {
  const missing: string[] = [];
  if (
    !config.sessionSecret ||
    config.sessionSecret === DEFAULT_DEV_SESSION_SECRET ||
    config.sessionSecret.length < MIN_PRODUCTION_SESSION_SECRET_LENGTH
  ) {
    missing.push(
      `SESSION_SECRET (at least ${MIN_PRODUCTION_SESSION_SECRET_LENGTH} characters)`
    );
  }
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabasePublishableKey)
    missing.push("SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

const missingProductionEnvVars = env.isProduction
  ? getMissingProductionEnvVars()
  : [];

if (missingProductionEnvVars.length > 0) {
  throw new Error(
    `Missing or unsafe required environment variables in production: ${missingProductionEnvVars.join(
      ", "
    )}. Configure them in Render before starting the service.`
  );
}
