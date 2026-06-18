import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmEmailFromUrl } from "./supabase-email-confirmation";
import type { SupabaseClient } from "@supabase/supabase-js";

const originalWindow = globalThis.window;

function installWindow(url: string) {
  const parsedUrl = new URL(url);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        hash: parsedUrl.hash,
        pathname: parsedUrl.pathname,
        search: parsedUrl.search,
      },
      history: {
        replaceState: vi.fn(),
      },
    },
  });
}

function createClientMock(
  verifyOtp: ReturnType<typeof vi.fn>
): SupabaseClient {
  return {
    auth: {
      verifyOtp,
    },
  } as unknown as SupabaseClient;
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("client email confirmation callback", () => {
  it("does not treat a marker-only callback as a confirmed email", async () => {
    installWindow("https://app.example.com/login?auth_action=confirm-email");
    const verifyOtp = vi.fn();

    await expect(confirmEmailFromUrl(createClientMock(verifyOtp))).rejects.toThrow(
      "Link di verifica email incompleto"
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("falls back to the current email OTP type when a legacy signup type fails", async () => {
    installWindow(
      "https://app.example.com/login?auth_action=confirm-email&token_hash=abc123&type=signup"
    );
    const verifyOtp = vi
      .fn()
      .mockResolvedValueOnce({
        data: { user: null, session: null },
        error: new Error("invalid token type"),
      })
      .mockResolvedValueOnce({
        data: { user: null, session: null },
        error: null,
      });

    await expect(
      confirmEmailFromUrl(createClientMock(verifyOtp))
    ).resolves.toBeUndefined();
    expect(verifyOtp).toHaveBeenNthCalledWith(1, {
      token_hash: "abc123",
      type: "signup",
    });
    expect(verifyOtp).toHaveBeenNthCalledWith(2, {
      token_hash: "abc123",
      type: "email",
    });
  });
});
