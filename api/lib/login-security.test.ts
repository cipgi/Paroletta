import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertLoginAllowed,
  buildLoginCaptcha,
  extractClientIp,
  loginSecurityConfig,
  recordFailedLogin,
  recordSuccessfulLogin,
  resetLoginSecurityStateForTests,
} from "./login-security";

describe("login security controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetLoginSecurityStateForTests();
  });

  it("extracts the original client IP from proxy headers", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.2",
    });

    expect(extractClientIp(headers)).toBe("203.0.113.10");
  });

  it("requires a valid CAPTCHA after repeated failed logins", () => {
    const ip = "203.0.113.20";
    const email = "user@example.com";

    for (let i = 0; i < loginSecurityConfig.captchaFailureThreshold; i++) {
      recordFailedLogin(ip, email);
    }

    expect(() => assertLoginAllowed({ ip, email })).toThrow(
      "CAPTCHA richiesto o non valido."
    );

    vi.spyOn(Math, "random").mockReturnValue(0);
    const captcha = buildLoginCaptcha();

    expect(() =>
      assertLoginAllowed({
        ip,
        email,
        captchaChallengeId: captcha.id,
        captchaAnswer: "4",
      })
    ).not.toThrow();
  });

  it("rate limits login attempts by IP within the configured window", () => {
    const ip = "203.0.113.30";
    const email = "user@example.com";

    for (let i = 0; i < loginSecurityConfig.maxLoginAttemptsPerIp; i++) {
      recordFailedLogin(ip, `${i}-${email}`);
    }

    expect(() => assertLoginAllowed({ ip, email })).toThrow(
      "Troppi tentativi di accesso. Riprova più tardi."
    );
  });

  it("temporarily locks an account after repeated failures", () => {
    const ip = "203.0.113.40";
    const email = "user@example.com";

    for (let i = 0; i < loginSecurityConfig.accountLockFailureThreshold; i++) {
      recordFailedLogin(`${ip}-${i}`, email);
    }

    expect(() => assertLoginAllowed({ ip, email })).toThrow(
      "Account temporaneamente bloccato. Riprova più tardi."
    );
  });

  it("clears failed-login counters after a successful login", () => {
    const ip = "203.0.113.50";
    const email = "user@example.com";

    for (let i = 0; i < loginSecurityConfig.captchaFailureThreshold; i++) {
      recordFailedLogin(ip, email);
    }

    recordSuccessfulLogin(ip, email);

    expect(() => assertLoginAllowed({ ip, email })).not.toThrow();
  });
});
