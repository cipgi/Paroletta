import { describe, expect, it } from "vitest";
import { formatSubscriptionStatus } from "../../src/lib/subscription";
import { resolveSubscriptionAccess } from "./subscription-access";

describe("formatSubscriptionStatus", () => {
  it("only formats display state without granting client-side access", () => {
    expect(formatSubscriptionStatus({ status: "attivo" })).toBe("attivo");
    expect(formatSubscriptionStatus(null)).toBe("nessuno");
  });
});

describe("resolveSubscriptionAccess", () => {
  const nowMs = new Date("2026-06-11T10:00:00.000Z").getTime();

  it("blocks an expired trial subscription", () => {
    expect(
      resolveSubscriptionAccess({
        nowMs,
        profile: {
          piano: "trial",
          created_at: "2026-05-01T10:00:00.000Z",
        },
        subscription: {
          status: "trial",
          plan: "trial",
          created_at: "2026-05-01T10:00:00.000Z",
          current_period_end: "2026-05-16T10:00:00.000Z",
        },
      }).accessActive
    ).toBe(false);
  });

  it("allows a manually assigned paid profile plan even with a cancelled subscription row", () => {
    const access = resolveSubscriptionAccess({
      nowMs,
      profile: {
        piano: "pro",
        created_at: "2026-05-01T10:00:00.000Z",
      },
      subscription: {
        status: "cancellato",
        plan: "trial",
        created_at: "2026-05-01T10:00:00.000Z",
        current_period_end: "2026-05-16T10:00:00.000Z",
      },
    });

    expect(access.accessActive).toBe(true);
    expect(access.plan).toBe("pro");
    expect(access.status).toBe("attivo");
    expect(access.derivedFromProfile).toBe(true);
  });

  it("allows a current trial profile when no subscription row exists", () => {
    const access = resolveSubscriptionAccess({
      nowMs,
      profile: {
        piano: "trial",
        created_at: "2026-06-10T10:00:00.000Z",
      },
      subscription: null,
    });

    expect(access.accessActive).toBe(true);
    expect(access.plan).toBe("trial");
  });

  it("does not allow removed or unknown profile plans", () => {
    const access = resolveSubscriptionAccess({
      nowMs,
      profile: {
        piano: "dev",
        created_at: "2026-05-01T10:00:00.000Z",
      },
      subscription: null,
    });

    expect(access.accessActive).toBe(false);
    expect(access.status).toBe("cancellato");
  });
});
