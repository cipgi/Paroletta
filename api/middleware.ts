import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { getSafeClientErrorMessage } from "./lib/errors";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { assertValidCsrfRequest } from "./lib/csrf";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message: getSafeClientErrorMessage(error.code),
      data: {
        ...shape.data,
        path: undefined,
        stack: undefined,
      },
    };
  },
});

export const createRouter = t.router;

const requireCsrf = t.middleware(async opts => {
  if (opts.type === "mutation") {
    assertValidCsrfRequest(opts.ctx.req);
  }

  return opts.next();
});

const baseProcedure = t.procedure.use(requireCsrf);
export const publicQuery = baseProcedure;

const requireAuth = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = baseProcedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
