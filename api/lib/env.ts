import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

if (env.isProduction && !supabaseConfigured) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required in production.");
}
