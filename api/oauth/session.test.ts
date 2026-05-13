import * as jose from "jose";
import { describe, expect, it } from "vitest";
import { Session } from "@contracts/constants";
import { signSessionToken, verifySessionToken } from "./session";

describe("session tokens", () => {
  it("uses the same max age for the JWT expiration and the session cookie", async () => {
    const token = await signSessionToken({
      unionId: "supabase:user-id",
      clientId: "supabase",
    });
    const decoded = jose.decodeJwt(token);

    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp! - decoded.iat!).toBe(
      Math.floor(Session.maxAgeMs / 1000)
    );
  });

  it("verifies a valid token payload", async () => {
    const token = await signSessionToken({
      unionId: "supabase:user-id",
      clientId: "supabase",
    });

    await expect(verifySessionToken(token)).resolves.toEqual({
      unionId: "supabase:user-id",
      clientId: "supabase",
    });
  });
});
