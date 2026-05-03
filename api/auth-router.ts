import * as cookie from "cookie";
import { z } from "zod";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { signSessionToken } from "./oauth/session";
import { upsertUser } from "./queries/users";
import { subscriptions, sheets, patients, users } from "./store";
import { supabase } from "./lib/supabase";
import { supabaseConfigured } from "./lib/env";
import { appDb } from "./lib/db";

async function ensureUserProfile(userId: string, email: string, name: string) {
  const { error } = await appDb()
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
        name,
      },
      { onConflict: "id" },
    );

  if (error) {
    throw new Error(error.message);
  }
}

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
      await ensureUserProfile(data.user.id, input.email, input.name ?? input.email.split("@")[0]);

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
      await ensureUserProfile(data.user.id, input.email, (data.user.user_metadata?.name as string | undefined) ?? input.email.split("@")[0]);

      const token = await signSessionToken({ unionId, clientId: "supabase" });
      const opts = getSessionCookieOptions(ctx.req.headers);
      ctx.resHeaders.append("set-cookie", cookie.serialize(Session.cookieName, token, {
        httpOnly: opts.httpOnly, path: opts.path, sameSite: opts.sameSite?.toLowerCase() as "lax" | "none", secure: opts.secure, maxAge: Session.maxAgeMs / 1000,
      }));
      return { success: true };
    }),
  me: authedQuery.query((opts) => opts.ctx.user),

  deleteAccount: authedQuery.mutation(async ({ ctx }) => {
    for (let i = sheets.length - 1; i >= 0; i--) if (sheets[i].userId === ctx.user.id) sheets.splice(i, 1);
    for (let i = patients.length - 1; i >= 0; i--) if (patients[i].userId === ctx.user.id) patients.splice(i, 1);
    for (let i = subscriptions.length - 1; i >= 0; i--) if (subscriptions[i].userId === ctx.user.id) subscriptions.splice(i, 1);
    for (let i = users.length - 1; i >= 0; i--) if (users[i].id === ctx.user.id) users.splice(i, 1);

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
