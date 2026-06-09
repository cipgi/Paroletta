import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { verifySessionToken } from "./session";
import { findUserByUnionId } from "../queries/users";
import { getSessionCookieOptions } from "../lib/cookies";
import {
  appendClearedSupabaseSessionCookies,
  resolveSupabaseAccessToken,
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
  appendClearedSupabaseSessionCookies(headers, resHeaders);
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

  const supabaseAccessToken =
    payload.clientId === "supabase"
      ? await resolveSupabaseAccessToken(headers, resHeaders)
      : undefined;
  if (payload.clientId === "supabase" && !supabaseAccessToken) {
    clearAuthCookies(headers, resHeaders);
    return undefined;
  }

  const user = await findUserByUnionId(payload.unionId, supabaseAccessToken);
  return user ? { user, supabaseAccessToken } : undefined;
}
