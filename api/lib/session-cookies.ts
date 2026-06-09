import * as cookie from "cookie";
import * as jose from "jose";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./cookies";
import { supabase } from "./supabase";
import type { Session as SupabaseSession } from "@supabase/supabase-js";

export const SUPABASE_ACCESS_COOKIE = "paroletta_sb_access";
export const SUPABASE_REFRESH_COOKIE = "paroletta_sb_refresh";

const ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS = 60;

function getCookieOptions(headers: Headers, maxAge: number) {
  const opts = getSessionCookieOptions(headers);
  return {
    httpOnly: opts.httpOnly,
    path: opts.path,
    sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
    secure: opts.secure,
    maxAge,
  };
}

function getAccessTokenMaxAge(session: SupabaseSession) {
  if (session.expires_at) {
    return Math.max(0, session.expires_at - Math.floor(Date.now() / 1000));
  }

  return Math.max(0, session.expires_in ?? 60 * 60);
}

function isAccessTokenUsable(token: string) {
  try {
    const decoded = jose.decodeJwt(token);
    if (!decoded.exp) return true;
    return (
      decoded.exp - Math.floor(Date.now() / 1000) >
      ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS
    );
  } catch {
    return true;
  }
}

export function getSupabaseAccessTokenFromHeaders(headers: Headers) {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return undefined;
  const cookies = cookie.parse(cookieHeader);
  return cookies[SUPABASE_ACCESS_COOKIE] || undefined;
}

export function getSupabaseRefreshTokenFromHeaders(headers: Headers) {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return undefined;
  const cookies = cookie.parse(cookieHeader);
  return cookies[SUPABASE_REFRESH_COOKIE] || undefined;
}

export function appendSupabaseSessionCookies(
  requestHeaders: Headers,
  responseHeaders: Headers,
  session: SupabaseSession
) {
  responseHeaders.append(
    "set-cookie",
    cookie.serialize(
      SUPABASE_ACCESS_COOKIE,
      session.access_token,
      getCookieOptions(requestHeaders, getAccessTokenMaxAge(session))
    )
  );

  if (session.refresh_token) {
    responseHeaders.append(
      "set-cookie",
      cookie.serialize(
        SUPABASE_REFRESH_COOKIE,
        session.refresh_token,
        getCookieOptions(requestHeaders, Session.maxAgeMs / 1000)
      )
    );
  }
}

export function appendClearedSupabaseSessionCookies(
  requestHeaders: Headers,
  responseHeaders: Headers
) {
  responseHeaders.append(
    "set-cookie",
    cookie.serialize(
      SUPABASE_ACCESS_COOKIE,
      "",
      getCookieOptions(requestHeaders, 0)
    )
  );
  responseHeaders.append(
    "set-cookie",
    cookie.serialize(
      SUPABASE_REFRESH_COOKIE,
      "",
      getCookieOptions(requestHeaders, 0)
    )
  );
}

export async function resolveSupabaseAccessToken(
  requestHeaders: Headers,
  responseHeaders?: Headers
) {
  const accessToken = getSupabaseAccessTokenFromHeaders(requestHeaders);
  if (accessToken && isAccessTokenUsable(accessToken)) return accessToken;

  const refreshToken = getSupabaseRefreshTokenFromHeaders(requestHeaders);
  if (!refreshToken || !responseHeaders) return undefined;

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session?.access_token) {
    appendClearedSupabaseSessionCookies(requestHeaders, responseHeaders);
    return undefined;
  }

  appendSupabaseSessionCookies(requestHeaders, responseHeaders, data.session);
  return data.session.access_token;
}
