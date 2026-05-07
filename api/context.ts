import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "./store";
import { authenticateRequest } from "./oauth/auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    ctx.user = undefined;
  }
  return ctx;
}
