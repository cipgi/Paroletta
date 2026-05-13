import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "./store";
import { authenticateRequest } from "./oauth/auth";
import { extractClientIp } from "./lib/login-security";
import { getSupabaseAccessTokenFromHeaders } from "./lib/session-cookies";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  clientIp: string;
  supabaseAccessToken?: string;
};

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TrpcContext> {
  const ctx: TrpcContext = {
    req: opts.req,
    resHeaders: opts.resHeaders,
    clientIp: extractClientIp(opts.req.headers),
    supabaseAccessToken: getSupabaseAccessTokenFromHeaders(opts.req.headers),
  };
  try {
    ctx.user = await authenticateRequest(opts.req.headers, opts.resHeaders);
  } catch {
    ctx.user = undefined;
  }
  return ctx;
}
