import * as cookie from "cookie";
import { describe, expect, it, vi } from "vitest";
import { Session } from "@contracts/constants";

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      refreshSession: vi.fn(),
    },
  },
}));

import {
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
  appendClearedSupabaseSessionCookies,
  appendSupabaseSessionCookies,
} from "./session-cookies";

function getSetCookies(headers: Headers) {
  return headers.getSetCookie();
}

describe("Supabase session cookies", () => {
  it("stores access and refresh tokens with the expected lifetimes", () => {
    const requestHeaders = new Headers({ host: "localhost:5173" });
    const responseHeaders = new Headers();
    const expiresIn = 45 * 60;

    appendSupabaseSessionCookies(requestHeaders, responseHeaders, {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      token_type: "bearer",
      user: {
        id: "user-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
      },
    });

    const cookies = getSetCookies(responseHeaders);
    const accessCookie = cookies.find(item =>
      item.startsWith(`${SUPABASE_ACCESS_COOKIE}=`)
    );
    const refreshCookie = cookies.find(item =>
      item.startsWith(`${SUPABASE_REFRESH_COOKIE}=`)
    );

    expect(accessCookie).toContain("access-token");
    expect(accessCookie).toContain(`Max-Age=${expiresIn}`);
    expect(refreshCookie).toContain("refresh-token");
    expect(refreshCookie).toContain(`Max-Age=${Session.maxAgeMs / 1000}`);
  });

  it("clears both Supabase session cookies", () => {
    const requestHeaders = new Headers({ host: "localhost:5173" });
    const responseHeaders = new Headers();

    appendClearedSupabaseSessionCookies(requestHeaders, responseHeaders);

    const parsedCookies = getSetCookies(responseHeaders).map(item =>
      cookie.parse(item)
    );

    expect(parsedCookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ [SUPABASE_ACCESS_COOKIE]: "" }),
        expect.objectContaining({ [SUPABASE_REFRESH_COOKIE]: "" }),
      ])
    );
    expect(getSetCookies(responseHeaders).every(item => item.includes("Max-Age=0"))).toBe(
      true
    );
  });
});
