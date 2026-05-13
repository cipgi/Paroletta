import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { verifySessionToken } from "./session";
import { findUserByUnionId } from "../queries/users";
import { getSessionCookieOptions } from "../lib/cookies";
import {
  SUPABASE_ACCESS_COOKIE,
  getSupabaseAccessTokenFromHeaders,
} from "../lib/session-cookies";

function clearAuthCookies(headers: Headers, resHeaders?: Headers) {
  if (!resHeaders) return;

  const opts = getSessionCookieOptions(headers);
  const cookieOptions = {
    httpOnly: opts.httpOnly,
    path: opts.path,
    sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
    secure: opts.secure,
    maxAge: 0,
  };

  resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, "", cookieOptions)
  );
  resHeaders.append(
    "set-cookie",
    cookie.serialize(SUPABASE_ACCESS_COOKIE, "", cookieOptions)
  );
}

export async function authenticateRequest(
  headers: Headers,
  resHeaders?: Headers
) {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookie.parse(cookieHeader);
  const token = cookies[Session.cookieName];
  if (!token) {
    return undefined;
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    clearAuthCookies(headers, resHeaders);
    return undefined;
  }

  return findUserByUnionId(
    payload.unionId,
    getSupabaseAccessTokenFromHeaders(headers)
  );
}
