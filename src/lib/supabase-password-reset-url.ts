export type RecoveryUrlParts = {
  hash: string;
  search: string;
};

export function readRecoveryParamsFromUrlParts(parts: RecoveryUrlParts) {
  const hash = new URLSearchParams(parts.hash.replace(/^#/, ""));
  const search = new URLSearchParams(parts.search);

  return {
    accessToken: hash.get("access_token") ?? search.get("access_token"),
    refreshToken: hash.get("refresh_token") ?? search.get("refresh_token"),
    type: hash.get("type") ?? search.get("type"),
    code: search.get("code") ?? hash.get("code"),
    error: hash.get("error") ?? search.get("error"),
    errorCode: hash.get("error_code") ?? search.get("error_code"),
  };
}

export function hasPasswordRecoveryCallbackInUrl(parts: RecoveryUrlParts) {
  const params = readRecoveryParamsFromUrlParts(parts);

  return Boolean(
    params.accessToken ||
      params.refreshToken ||
      params.code ||
      params.type === "recovery" ||
      params.error ||
      params.errorCode
  );
}

export function getPasswordRecoveryErrorMessageFromUrl(
  parts: RecoveryUrlParts
) {
  const params = readRecoveryParamsFromUrlParts(parts);

  if (!params.error && !params.errorCode) return null;

  if (params.errorCode === "otp_expired") {
    return "Link non valido o scaduto. Richiedi un nuovo recupero password.";
  }

  return "Link di recupero non valido. Richiedi un nuovo recupero password.";
}
