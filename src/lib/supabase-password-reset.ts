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
  };
}

function clearRecoveryParamsFromUrl() {
  window.history.replaceState(null, "", window.location.pathname);
}

export async function establishPasswordRecoverySession(client: SupabaseClient) {
  const params = readRecoveryParams();

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
