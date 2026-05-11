import { describe, expect, it } from "vitest";
import { formatSubscriptionStatus } from "../../src/lib/subscription";

describe("formatSubscriptionStatus", () => {
  it("only formats display state without granting client-side access", () => {
    expect(formatSubscriptionStatus({ status: "attivo" })).toBe("attivo");
    expect(formatSubscriptionStatus(null)).toBe("nessuno");
  });
});
