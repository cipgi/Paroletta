import { env } from "./env";

export const EMAIL_CONFIRMATION_ACTION = "confirm-email";

export function buildEmailConfirmationRedirectUrl(request: Request) {
  const baseUrl = env.appBaseUrl || new URL(request.url).origin;
  const redirectUrl = new URL("login", `${baseUrl.replace(/\/+$/, "")}/`);
  redirectUrl.searchParams.set("auth_action", EMAIL_CONFIRMATION_ACTION);
  return redirectUrl.toString();
}

export function isSupabaseEmailNotConfirmedError(error: unknown) {
  const maybeError = error as { code?: string; message?: string } | null;
  const code = maybeError?.code?.toLowerCase();
  const message = maybeError?.message?.toLowerCase() ?? "";

  return (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed") ||
    message.includes("not confirmed")
  );
}

export function isObfuscatedExistingSupabaseUser(
  user: { identities?: unknown[] | null } | null
) {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}
