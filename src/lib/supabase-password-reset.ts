import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getPasswordRecoveryErrorMessageFromUrl,
  hasPasswordRecoveryCallbackInUrl,
  readRecoveryParamsFromUrlParts,
} from "./supabase-password-reset-url";

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
  return readRecoveryParamsFromUrlParts({
    hash: window.location.hash,
    search: window.location.search,
  });
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
  return hasPasswordRecoveryCallbackInUrl({
    hash: window.location.hash,
    search: window.location.search,
  });
}

export function getPasswordRecoveryErrorMessage() {
  return getPasswordRecoveryErrorMessageFromUrl({
    hash: window.location.hash,
    search: window.location.search,
  });
}
