import * as cookie from "cookie";
import { z } from "zod";
import { PasswordPolicy, Session } from "@contracts/constants";
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
import { supabase, supabaseAdmin } from "./lib/supabase";
import { supabaseConfigured } from "./lib/env";
import {
  adminAppDb,
  appDbForAccessToken,
  getSupabaseUserIdFromUnionId,
} from "./lib/db";
import {
  databaseOperationError,
  missingResourceError,
  userFacingError,
} from "./lib/errors";
import {
  MAX_PROFILE_NAME_LENGTH,
  sanitizeProfileNameOrFallback,
} from "./lib/sanitize";
import { SUPABASE_ACCESS_COOKIE } from "./lib/session-cookies";

// Supabase email/password authentication lives in this router. OAuth provider
// handlers are intentionally separate so removing Google OAuth does not affect
// credentials-based registration or login.

type AppDbClient = ReturnType<typeof appDbForAccessToken>;
const DEVELOPMENT_INITIAL_PLAN = "sviluppo";

async function ensureUserProfile(
  db: AppDbClient,
  userId: string,
  email: string,
  name: string
) {
  const safeName = sanitizeProfileNameOrFallback(
    name,
    email.split("@")[0] || "Utente"
  );
  const { error } = await db.from("profiles").upsert(
    {
      id: userId,
      email,
      name: safeName,
    },
    { onConflict: "id" }
  );

  if (error) {
    throw databaseOperationError("creare o aggiornare il profilo", error);
  }
}

function getAppDbForSession(accessToken?: string) {
  return accessToken ? appDbForAccessToken(accessToken) : adminAppDb();
}

const credentialsSchema = z.object({
  email: z.email().transform(value => value.trim().toLowerCase()),
  password: z
    .string()
    .min(PasswordPolicy.minLength, PasswordPolicy.minLengthMessage)
    .regex(
      PasswordPolicy.alphanumericPattern,
      PasswordPolicy.alphanumericMessage
    ),
  name: z
    .string()
    .transform(value => sanitizeProfileNameOrFallback(value, "Utente"))
    .pipe(z.string().min(2).max(MAX_PROFILE_NAME_LENGTH))
    .optional(),
  initialPlan: z.literal(DEVELOPMENT_INITIAL_PLAN).optional(),
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
        throw userFacingError(
          "SERVICE_UNAVAILABLE",
          "Accesso temporaneamente non disponibile: autenticazione non configurata."
        );
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
        throw userFacingError(
          "BAD_REQUEST",
          error?.message
            ? `Registrazione non riuscita: ${error.message}`
            : "Registrazione non riuscita: controlla email e password e riprova.",
          error
        );

      const appDatabase = getAppDbForSession(data.session?.access_token);
      const unionId = `supabase:${data.user.id}`;
      await upsertUser({
        unionId,
        email: input.email,
        name: profileName,
        lastSignInAt: new Date(),
        role: "user",
      });
      const requestedPlan = DEVELOPMENT_INITIAL_PLAN;
      const { data: selectedPlan, error: selectedPlanError } = await appDatabase
        .from("subscription_plans")
        .select("code,duration_days,is_trial,active")
        .eq("code", requestedPlan)
        .eq("active", true)
        .maybeSingle();
      if (selectedPlanError)
        throw databaseOperationError(
          "verificare il piano iniziale",
          selectedPlanError
        );
      if (!selectedPlan) throw missingResourceError("Piano iniziale");

      const initialPlan = selectedPlan.code;
      await ensureUserProfile(
        appDatabase,
        data.user.id,
        input.email,
        profileName
      );
      const { error: profileError } = await appDatabase
        .from("profiles")
        .update({ piano: initialPlan, seats: 1 })
        .eq("id", data.user.id);
      if (profileError)
        throw databaseOperationError(
          "salvare il piano sul profilo",
          profileError
        );
      const now = new Date().toISOString();
      const periodEnd = new Date(
        Date.now() + selectedPlan.duration_days * 24 * 60 * 60 * 1000
      ).toISOString();
      const { error: subError } = await appDatabase
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
      if (subError)
        throw databaseOperationError(
          "attivare l’abbonamento iniziale",
          subError
        );

      return { success: true, verificationRequired: true };
    }),
  loginWithCredentials: publicQuery
    .input(loginCredentialsSchema)
    .mutation(async ({ input, ctx }) => {
      if (!supabaseConfigured) {
        throw userFacingError(
          "SERVICE_UNAVAILABLE",
          "Accesso temporaneamente non disponibile: autenticazione non configurata."
        );
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
        throw userFacingError(
          "UNAUTHORIZED",
          "Email o password non corretti. Verifica le credenziali e riprova."
        );
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
      // Login must only authenticate and establish the app session. Profile
      // creation/repair belongs to registration or explicit maintenance flows,
      // not to a sign-in attempt.
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
      if (data.session?.access_token) {
        ctx.resHeaders.append(
          "set-cookie",
          cookie.serialize(SUPABASE_ACCESS_COOKIE, data.session.access_token, {
            httpOnly: true,
            path: opts.path,
            sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
            secure: opts.secure,
            maxAge: 15 * 60,
          })
        );
      }
      return { success: true };
    }),
  me: publicQuery.query(opts => opts.ctx.user ?? null),

  deleteAccount: authedQuery
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = getSupabaseUserIdFromUnionId(ctx.user.unionId);
      if (!supabaseUserId) throw missingResourceError("Account");

      const email = ctx.user.email;
      if (!email) throw missingResourceError("Account");

      const { error: passwordError } = await supabase.auth.signInWithPassword({
        email,
        password: input.password,
      });
      if (passwordError) {
        throw userFacingError(
          "UNAUTHORIZED",
          "Password non corretta. L'account non è stato eliminato.",
          passwordError
        );
      }

      const { error } =
        await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
      if (error) {
        throw databaseOperationError(
          "eliminare definitivamente l'account",
          error
        );
      }

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
      ctx.resHeaders.append(
        "set-cookie",
        cookie.serialize(SUPABASE_ACCESS_COOKIE, "", {
          httpOnly: true,
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
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(SUPABASE_ACCESS_COOKIE, "", {
        httpOnly: true,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
        secure: opts.secure,
        maxAge: 0,
      })
    );
    return { success: true };
  }),
});
