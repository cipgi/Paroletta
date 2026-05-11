import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { verifySessionToken } from "./session";
import { findUserByUnionId } from "../queries/users";
import { getSupabaseAccessTokenFromHeaders } from "../lib/session-cookies";

export async function authenticateRequest(headers: Headers) {
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
    return undefined;
  }

  return findUserByUnionId(
    payload.unionId,
    getSupabaseAccessTokenFromHeaders(headers)
  );
}
