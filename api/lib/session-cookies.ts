import * as cookie from "cookie";

export const SUPABASE_ACCESS_COOKIE = "paroletta_sb_access";

export function getSupabaseAccessTokenFromHeaders(headers: Headers) {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return undefined;
  const cookies = cookie.parse(cookieHeader);
  return cookies[SUPABASE_ACCESS_COOKIE] || undefined;
}
