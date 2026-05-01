import * as cookie from "cookie";
import { z } from "zod";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { signSessionToken } from "./oauth/session";
import { upsertUser } from "./queries/users";
import { getDb } from "./queries/connection";
import { subscriptions, sheets, patients, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { supabase } from "./lib/supabase";
import { supabaseConfigured } from "./lib/env";

const credentialsSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8),
  name: z.string().trim().min(2).max(255).optional(),
});

export const authRouter = createRouter({
  registerWithCredentials: publicQuery
    .input(credentialsSchema)
    .mutation(async ({ input, ctx }) => {
      if (!supabaseConfigured) {
        throw new Error("Autenticazione con Supabase non configurata");
      }
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { name: input.name ?? input.email.split("@")[0] } },
      });
      if (error || !data.user) throw new Error(error?.message ?? "Registrazione fallita");

      const unionId = `supabase:${data.user.id}`;
      await upsertUser({
        unionId,
        email: input.email,
        name: input.name ?? input.email.split("@")[0],
        lastSignInAt: new Date(),
        role: "user",
      });

      const token = await signSessionToken({ unionId, clientId: "supabase" });
      const opts = getSessionCookieOptions(ctx.req.headers);
      ctx.resHeaders.append("set-cookie", cookie.serialize(Session.cookieName, token, {
        httpOnly: opts.httpOnly, path: opts.path, sameSite: opts.sameSite?.toLowerCase() as "lax" | "none", secure: opts.secure, maxAge: Session.maxAgeMs / 1000,
      }));
      return { success: true };
    }),
  loginWithCredentials: publicQuery
    .input(credentialsSchema.pick({ email: true, password: true }))
    .mutation(async ({ input, ctx }) => {
      if (!supabaseConfigured) {
        throw new Error("Autenticazione con Supabase non configurata");
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error || !data.user) throw new Error("Credenziali non valide");

      const unionId = `supabase:${data.user.id}`;
      await upsertUser({
        unionId,
        email: input.email,
        name: (data.user.user_metadata?.name as string | undefined) ?? input.email.split("@")[0],
        lastSignInAt: new Date(),
        role: "user",
      });

      const token = await signSessionToken({ unionId, clientId: "supabase" });
      const opts = getSessionCookieOptions(ctx.req.headers);
      ctx.resHeaders.append("set-cookie", cookie.serialize(Session.cookieName, token, {
        httpOnly: opts.httpOnly, path: opts.path, sameSite: opts.sameSite?.toLowerCase() as "lax" | "none", secure: opts.secure, maxAge: Session.maxAgeMs / 1000,
      }));
      return { success: true };
    }),
  me: authedQuery.query((opts) => opts.ctx.user),

  deleteAccount: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();

    await db.delete(sheets).where(eq(sheets.userId, ctx.user.id));
    await db.delete(patients).where(eq(patients.userId, ctx.user.id));
    await db.delete(subscriptions).where(eq(subscriptions.userId, ctx.user.id));
    await db.delete(users).where(eq(users.id, ctx.user.id));

    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );

    return { success: true };
  }),
  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),
});
