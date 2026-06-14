import { describe, expect, it } from "vitest";
import {
  getPasswordRecoveryErrorMessageFromUrl,
  hasPasswordRecoveryCallbackInUrl,
  readRecoveryParamsFromUrlParts,
} from "../../src/lib/supabase-password-reset-url";

describe("Supabase password recovery URL helpers", () => {
  it("detects expired Supabase recovery callbacks returned on the root URL", () => {
    const parts = {
      search: "",
      hash:
        "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=",
    };

    expect(hasPasswordRecoveryCallbackInUrl(parts)).toBe(true);
    expect(getPasswordRecoveryErrorMessageFromUrl(parts)).toBe(
      "Link non valido o scaduto. Richiedi un nuovo recupero password."
    );
  });

  it("reads both implicit and PKCE recovery parameters", () => {
    expect(
      readRecoveryParamsFromUrlParts({
        search: "?code=pkce-code",
        hash: "#type=recovery",
      })
    ).toMatchObject({
      code: "pkce-code",
      type: "recovery",
    });

    expect(
      readRecoveryParamsFromUrlParts({
        search: "",
        hash: "#access_token=access&refresh_token=refresh&type=recovery",
      })
    ).toMatchObject({
      accessToken: "access",
      refreshToken: "refresh",
      type: "recovery",
    });
  });
});
