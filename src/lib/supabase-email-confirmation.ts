import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabasePublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type EmailConfirmationType = "signup" | "email";

const EMAIL_CONFIRMATION_ACTION = "confirm-email";
const EMAIL_CONFIRMATION_TYPES = new Set(["signup", "email"]);
const MISSING_EMAIL_CONFIRMATION_TOKEN_MESSAGE =
  "Link di verifica email incompleto. Apri il link completo ricevuto via email o richiedi una nuova email di conferma.";

export function createEmailConfirmationSupabaseClient(
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

function readEmailConfirmationParams() {
  if (typeof window === "undefined") {
    return {
      action: null,
      accessToken: null,
      code: null,
      email: null,
      error: null,
      errorCode: null,
      refreshToken: null,
      token: null,
      tokenHash: null,
      type: null,
    };
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);

  return {
    action: search.get("auth_action") ?? hash.get("auth_action"),
    accessToken: hash.get("access_token") ?? search.get("access_token"),
    code: search.get("code") ?? hash.get("code"),
    email: search.get("email") ?? hash.get("email"),
    error: hash.get("error") ?? search.get("error"),
    errorCode: hash.get("error_code") ?? search.get("error_code"),
    refreshToken: hash.get("refresh_token") ?? search.get("refresh_token"),
    token: search.get("token") ?? hash.get("token"),
    tokenHash:
      search.get("token_hash") ??
      hash.get("token_hash") ??
      search.get("tokenHash") ??
      hash.get("tokenHash"),
    type: search.get("type") ?? hash.get("type"),
  };
}

function isEmailConfirmationType(
  value: string | null
): value is EmailConfirmationType {
  return EMAIL_CONFIRMATION_TYPES.has(value ?? "");
}

function getEmailConfirmationTypes(
  explicitType: EmailConfirmationType | null
) {
  const fallbackTypes: EmailConfirmationType[] = ["email", "signup"];
  return explicitType
    ? [
        explicitType,
        ...fallbackTypes.filter(type => type !== explicitType),
      ]
    : fallbackTypes;
}

function clearEmailConfirmationParamsFromUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", "/login");
}

function getEmailConfirmationErrorMessage() {
  const params = readEmailConfirmationParams();

  if (!params.error && !params.errorCode) return null;

  if (params.errorCode === "otp_expired") {
    return "Link di verifica scaduto. Richiedi una nuova email di conferma.";
  }

  return "Link di verifica email non valido. Richiedi una nuova email di conferma.";
}

async function verifyTokenHash(
  client: SupabaseClient,
  tokenHash: string,
  explicitType: EmailConfirmationType | null
) {
  const types = getEmailConfirmationTypes(explicitType);
  let lastError: unknown;

  for (const type of types) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) return;
    lastError = error;
  }

  throw lastError ?? new Error("email_confirmation_failed");
}

async function verifyEmailToken(
  client: SupabaseClient,
  email: string,
  token: string,
  explicitType: EmailConfirmationType | null
) {
  const types = getEmailConfirmationTypes(explicitType);
  let lastError: unknown;

  for (const type of types) {
    const { error } = await client.auth.verifyOtp({
      email,
      token,
      type,
    });
    if (!error) return;
    lastError = error;
  }

  throw lastError ?? new Error("email_confirmation_failed");
}

export function hasEmailConfirmationCallback() {
  const params = readEmailConfirmationParams();
  const isMarkedConfirmation = params.action === EMAIL_CONFIRMATION_ACTION;
  const hasConfirmationType = isEmailConfirmationType(params.type);

  return Boolean(
    isMarkedConfirmation ||
    hasConfirmationType ||
    (params.tokenHash && params.type !== "recovery")
  );
}

export async function confirmEmailFromUrl(client: SupabaseClient) {
  const params = readEmailConfirmationParams();
  const errorMessage = getEmailConfirmationErrorMessage();

  if (errorMessage) {
    clearEmailConfirmationParamsFromUrl();
    throw new Error(errorMessage);
  }

  const explicitType = isEmailConfirmationType(params.type)
    ? params.type
    : null;

  try {
    if (params.tokenHash) {
      await verifyTokenHash(client, params.tokenHash, explicitType);
      clearEmailConfirmationParamsFromUrl();
      return;
    }

    if (params.email && params.token) {
      await verifyEmailToken(client, params.email, params.token, explicitType);
      clearEmailConfirmationParamsFromUrl();
      return;
    }

    if (params.code) {
      const { error } = await client.auth.exchangeCodeForSession(params.code);
      if (error) throw error;
      clearEmailConfirmationParamsFromUrl();
      return;
    }

    if (params.accessToken && params.refreshToken) {
      const { error } = await client.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      });
      if (error) throw error;
      clearEmailConfirmationParamsFromUrl();
      return;
    }

    if (params.action === EMAIL_CONFIRMATION_ACTION) {
      throw new Error(MISSING_EMAIL_CONFIRMATION_TOKEN_MESSAGE);
    }
  } catch (error) {
    clearEmailConfirmationParamsFromUrl();
    throw error;
  }

  clearEmailConfirmationParamsFromUrl();
  throw new Error(MISSING_EMAIL_CONFIRMATION_TOKEN_MESSAGE);
}

export function finishEmailConfirmationUrlCleanup() {
  clearEmailConfirmationParamsFromUrl();
}
