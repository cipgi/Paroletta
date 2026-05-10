import * as cookie from "cookie";
import { z } from "zod";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import {
  assertLoginAllowed,
  buildLoginCaptcha,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "./lib/login-security";
import { signSessionToken } from "./oauth/session";
import { upsertUser } from "./queries/users";
import { subscriptions, sheets, users } from "./store";
import { supabase } from "./lib/supabase";
import { supabaseConfigured } from "./lib/env";
import { appDb } from "./lib/db";
import {
  MAX_PROFILE_NAME_LENGTH,
  sanitizeProfileNameOrFallback,
} from "./lib/sanitize";

// Supabase email/password authentication lives in this router. OAuth provider
// handlers are intentionally separate so removing Google OAuth does not affect
// credentials-based registration or login.

async function ensureUserProfile(userId: string, email: string, name: string) {
  const safeName = sanitizeProfileNameOrFallback(
    name,
    email.split("@")[0] || "Utente"
  );
  const { error } = await appDb().from("profiles").upsert(
    {
      id: userId,
      email,
      name: safeName,
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

const credentialsSchema = z.object({
  email: z.email().transform(value => value.trim().toLowerCase()),
  password: z.string().min(8),
  name: z
    .string()
    .transform(value => sanitizeProfileNameOrFallback(value, "Utente"))
    .pipe(z.string().min(2).max(MAX_PROFILE_NAME_LENGTH))
    .optional(),
  initialPlan: z.string().min(1).optional(),
});

const loginCredentialsSchema = credentialsSchema
  .pick({ email: true, password: true })
  .extend({
    captchaChallengeId: z.string().optional(),
    captchaAnswer: z.string().optional(),
  });

export const authRouter = createRouter({
  loginCaptcha: publicQuery.query(() => buildLoginCaptcha()),
  registerWithCredentials: publicQuery
    .input(credentialsSchema)
    .mutation(async ({ input }) => {
      if (!supabaseConfigured) {
        throw new Error("Autenticazione con Supabase non configurata");
      }
      const profileName = sanitizeProfileNameOrFallback(
        input.name,
        input.email.split("@")[0]
      );
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { name: profileName } },
      });
      if (error || !data.user)
        throw new Error(error?.message ?? "Registrazione fallita");

      const unionId = `supabase:${data.user.id}`;
      await upsertUser({
        unionId,
        email: input.email,
        name: profileName,
        lastSignInAt: new Date(),
        role: "user",
      });
      const requestedPlan = input.initialPlan ?? "trial";
      const { data: selectedPlan, error: selectedPlanError } = await appDb()
        .from("subscription_plans")
        .select("code,duration_days,is_trial,active")
        .eq("code", requestedPlan)
        .eq("active", true)
        .maybeSingle();
      if (selectedPlanError) throw new Error(selectedPlanError.message);
      if (!selectedPlan) throw new Error("Piano iniziale non valido");
      if (!selectedPlan.is_trial)
        throw new Error("Il piano iniziale deve essere trial");

      const initialPlan = selectedPlan.code;
      await ensureUserProfile(data.user.id, input.email, profileName);
      const { error: profileError } = await appDb()
        .from("profiles")
        .update({ piano: initialPlan, seats: 1 })
        .eq("id", data.user.id);
      if (profileError) throw new Error(profileError.message);
      const now = new Date().toISOString();
      const periodEnd = new Date(
        Date.now() + selectedPlan.duration_days * 24 * 60 * 60 * 1000
      ).toISOString();
      const { error: subError } = await appDb()
        .from("subscriptions")
        .upsert(
          {
            user_id: data.user.id,
            status: selectedPlan.is_trial ? "trial" : "attivo",
            plan: initialPlan,
            seats_count: 1,
            current_period_start: now,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
          },
          { onConflict: "user_id" }
        );
      if (subError) throw new Error(subError.message);

      return { success: true, verificationRequired: true };
    }),
  loginWithCredentials: publicQuery
    .input(loginCredentialsSchema)
    .mutation(async ({ input, ctx }) => {
      if (!supabaseConfigured) {
        throw new Error("Autenticazione con Supabase non configurata");
      }

      assertLoginAllowed({
        ip: ctx.clientIp,
        email: input.email,
        captchaChallengeId: input.captchaChallengeId,
        captchaAnswer: input.captchaAnswer,
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error || !data.user) {
        recordFailedLogin(ctx.clientIp, input.email);
        throw new Error("Credenziali non valide");
      }

      recordSuccessfulLogin(ctx.clientIp, input.email);
      const unionId = `supabase:${data.user.id}`;
      const profileName = sanitizeProfileNameOrFallback(
        data.user.user_metadata?.name as string | undefined,
        input.email.split("@")[0]
      );
      await upsertUser({
        unionId,
        email: input.email,
        name: profileName,
        lastSignInAt: new Date(),
        role: "user",
      });
      await ensureUserProfile(data.user.id, input.email, profileName);

      const token = await signSessionToken({ unionId, clientId: "supabase" });
      const opts = getSessionCookieOptions(ctx.req.headers);
      ctx.resHeaders.append(
        "set-cookie",
        cookie.serialize(Session.cookieName, token, {
          httpOnly: opts.httpOnly,
          path: opts.path,
          sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
          secure: opts.secure,
          maxAge: Session.maxAgeMs / 1000,
        })
      );
      return { success: true };
    }),
  me: authedQuery.query(opts => opts.ctx.user),

  deleteAccount: authedQuery.mutation(async ({ ctx }) => {
    for (let i = sheets.length - 1; i >= 0; i--)
      if (sheets[i].userId === ctx.user.id) sheets.splice(i, 1);
    for (let i = subscriptions.length - 1; i >= 0; i--)
      if (subscriptions[i].userId === ctx.user.id) subscriptions.splice(i, 1);
    for (let i = users.length - 1; i >= 0; i--)
      if (users[i].id === ctx.user.id) users.splice(i, 1);

    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
        secure: opts.secure,
        maxAge: 0,
      })
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
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
        secure: opts.secure,
        maxAge: 0,
      })
    );
    return { success: true };
  }),
});
