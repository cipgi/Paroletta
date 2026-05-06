import * as cookie from "cookie";
import { randomBytes } from "node:crypto";
import { Csrf } from "@contracts/constants";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "./store";
import { authenticateRequest } from "./oauth/auth";
import { getCsrfCookieOptions, parseCsrfCookie } from "./lib/csrf";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

function ensureCsrfCookie(opts: FetchCreateContextFnOptions) {
  if (parseCsrfCookie(opts.req.headers)) return;

  const csrfToken = randomBytes(32).toString("base64url");
  const cookieOpts = getCsrfCookieOptions(opts.req.headers);
  opts.resHeaders.append(
    "set-cookie",
    cookie.serialize(Csrf.cookieName, csrfToken, {
      httpOnly: cookieOpts.httpOnly,
      path: cookieOpts.path,
      sameSite: cookieOpts.sameSite?.toLowerCase() as "lax",
      secure: cookieOpts.secure,
      maxAge: Csrf.maxAgeMs / 1000,
    })
  );
}

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TrpcContext> {
  ensureCsrfCookie(opts);
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    ctx.user = undefined;
  }
  return ctx;
}
