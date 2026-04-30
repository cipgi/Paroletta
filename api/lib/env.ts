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
  oauthAuthUrl: process.env.OAUTH_AUTH_URL ?? "",
  oauthApiUrl: process.env.OAUTH_API_URL ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "dev-session-secret",
};
