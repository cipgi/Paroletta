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
};

export const supabaseConfigured = Boolean(
  env.supabaseUrl && env.supabasePublishableKey
);

if (env.isProduction && !supabaseConfigured) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required in production."
  );
}
