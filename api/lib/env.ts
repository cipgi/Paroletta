import "dotenv/config";

const cspModeValues = ["off", "report-only", "enforce"] as const;
export type CspMode = (typeof cspModeValues)[number];

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
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret",
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
    `Missing required Supabase environment variables in production: ${missingProductionEnvVars.join(
      ", "
    )}. Configure them in Render before starting the service.`
  );
}
