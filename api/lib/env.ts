import "dotenv/config";

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabasePublishableKey);

if (env.isProduction && !supabaseConfigured) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required in production.");
}
