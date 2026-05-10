import { describe, expect, it, vi } from "vitest";
import { isSubscriptionCurrentlyValid } from "../../src/lib/subscription";

describe("isSubscriptionCurrentlyValid", () => {
  it("keeps open-ended active subscriptions valid", () => {
    expect(
      isSubscriptionCurrentlyValid({ status: "attivo", currentPeriodEnd: null })
    ).toBe(true);
  });

  it("requires a future period end for trial and cancelled subscriptions", () => {
    vi.setSystemTime(new Date("2026-05-10T00:00:00.000Z"));

    expect(
      isSubscriptionCurrentlyValid({
        status: "trial",
        currentPeriodEnd: "2026-05-11T00:00:00.000Z",
      })
    ).toBe(true);
    expect(
      isSubscriptionCurrentlyValid({ status: "trial", currentPeriodEnd: null })
    ).toBe(false);
    expect(
      isSubscriptionCurrentlyValid({
        status: "cancellato",
        currentPeriodEnd: "2026-05-09T00:00:00.000Z",
      })
    ).toBe(false);

    vi.useRealTimers();
  });
});
