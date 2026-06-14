import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabasePublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function createPasswordResetSupabaseClient(
  config: SupabasePublicConfig
) {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function readRecoveryParams() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);

  return {
    accessToken: hash.get("access_token") ?? search.get("access_token"),
    refreshToken: hash.get("refresh_token") ?? search.get("refresh_token"),
    type: hash.get("type") ?? search.get("type"),
    code: search.get("code") ?? hash.get("code"),
    error: hash.get("error") ?? search.get("error"),
    errorCode: hash.get("error_code") ?? search.get("error_code"),
  };
}

function clearRecoveryParamsFromUrl() {
  window.history.replaceState(null, "", window.location.pathname);
}

export async function establishPasswordRecoverySession(client: SupabaseClient) {
  const params = readRecoveryParams();
  const errorMessage = getPasswordRecoveryErrorMessage();

  if (errorMessage) {
    clearRecoveryParamsFromUrl();
    throw new Error(errorMessage);
  }

  if (params.accessToken && params.refreshToken) {
    const { error } = await client.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    clearRecoveryParamsFromUrl();

    if (error) throw error;
    return;
  }

  if (params.code) {
    const { error } = await client.auth.exchangeCodeForSession(params.code);
    clearRecoveryParamsFromUrl();

    if (error) throw error;
    return;
  }

  if (params.type === "recovery") {
    clearRecoveryParamsFromUrl();
  }

  throw new Error("missing_recovery_session");
}

export function hasPasswordRecoveryCallback() {
  const params = readRecoveryParams();

  return Boolean(
    params.accessToken ||
    params.refreshToken ||
    params.code ||
    params.type === "recovery" ||
    params.error ||
    params.errorCode
  );
}

export function getPasswordRecoveryErrorMessage() {
  const params = readRecoveryParams();

  if (!params.error && !params.errorCode) return null;

  if (params.errorCode === "otp_expired") {
    return "Link non valido o scaduto. Richiedi un nuovo recupero password.";
  }

  return "Link di recupero non valido. Richiedi un nuovo recupero password.";
}
