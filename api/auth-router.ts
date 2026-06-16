import * as cookie from "cookie";
import { z } from "zod";
import { PasswordPolicy, Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import {
  assertLoginAllowed,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "./lib/login-security";
import { signSessionToken } from "./oauth/session";
import { upsertUser } from "./queries/users";
import { subscriptions, sheets, users } from "./store";
import { supabase, supabaseAdmin } from "./lib/supabase";
import { env, supabaseAdminConfigured, supabaseConfigured } from "./lib/env";
import { adminAppDb, getSupabaseUserIdFromUnionId } from "./lib/db";
import {
  databaseOperationError,
  missingResourceError,
  userFacingError,
} from "./lib/errors";
import {
  MAX_PROFILE_NAME_LENGTH,
  sanitizeProfileNameOrFallback,
} from "./lib/sanitize";
import {
  appendClearedSupabaseSessionCookies,
  appendSupabaseSessionCookies,
} from "./lib/session-cookies";
import {
  PASSWORD_RESET_ACCOUNT_NOT_FOUND_MESSAGE,
  PASSWORD_RESET_RATE_LIMITED_MESSAGE,
  PASSWORD_RESET_SEND_FAILED_MESSAGE,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  buildPasswordResetRedirectUrl,
  getPasswordResetFailureCode,
  getPasswordResetWindowStart,
  hashPasswordResetIdentifier,
  isPasswordResetRateLimited,
} from "./lib/password-reset-security";
import {
  EMAIL_CONFIRMATION_ALREADY_CONFIRMED_MESSAGE,
  EMAIL_CONFIRMATION_NOT_FOUND_MESSAGE,
  EMAIL_CONFIRMATION_RATE_LIMITED_MESSAGE,
  EMAIL_CONFIRMATION_RESENT_MESSAGE,
  EMAIL_CONFIRMATION_SEND_FAILED_MESSAGE,
  buildEmailConfirmationRedirectUrl,
  getEmailConfirmationFailureCode,
  getEmailConfirmationWindowStart,
  hashEmailConfirmationIdentifier,
  isEmailConfirmationRateLimited,
  isObfuscatedExistingSupabaseUser,
  isSupabaseEmailNotConfirmedError,
  isSupabaseUserEmailConfirmed,
} from "./lib/email-confirmation";

// Supabase email/password authentication lives in this router. OAuth provider
// handlers are intentionally separate so removing Google OAuth does not affect
// credentials-based registration or login.

type AppDbClient = ReturnType<typeof adminAppDb>;
const PUBLIC_INITIAL_PLAN = "trial";

function normalizedEmailSchema() {
  return z.preprocess(
    value => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.email()
  );
}

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

const credentialsSchema = z.object({
  email: normalizedEmailSchema(),
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
});

const loginCredentialsSchema = credentialsSchema.pick({
  email: true,
  password: true,
});

const passwordResetRequestSchema = z.object({
  email: normalizedEmailSchema(),
});

const emailConfirmationRequestSchema = z.object({
  email: normalizedEmailSchema(),
});

type PasswordResetRequestStatus =
  | "sent"
  | "failed"
  | "rate_limited"
  | "suppressed";

type EmailConfirmationRequestStatus =
  | "sent"
  | "failed"
  | "rate_limited"
  | "suppressed";

type EmailConfirmationDeliveryStatus =
  | "sent"
  | "already_confirmed"
  | "not_found"
  | "rate_limited"
  | "failed";

async function countRecentPasswordResetRequests(
  db: AppDbClient,
  column: "email_hash" | "client_ip_hash",
  value: string,
  windowStart: string
) {
  const { count, error } = await db
    .from("password_reset_requests")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", windowStart);

  if (error) {
    throw databaseOperationError(
      "verificare il limite recupero password",
      error
    );
  }

  return count ?? 0;
}

async function recordPasswordResetRequest(params: {
  db: AppDbClient;
  emailHash: string;
  clientIpHash: string;
  status: PasswordResetRequestStatus;
  failureCode?: string;
}) {
  const { error } = await params.db.from("password_reset_requests").insert({
    email_hash: params.emailHash,
    client_ip_hash: params.clientIpHash,
    status: params.status,
    failure_code: params.failureCode ?? null,
  });

  if (error) {
    console.warn("[password-reset] audit insert failed", {
      status: params.status,
      code: getPasswordResetFailureCode(error),
    });
  }
}

async function countRecentEmailConfirmationRequests(
  db: AppDbClient,
  column: "email_hash" | "client_ip_hash",
  value: string,
  windowStart: string
) {
  const { count, error } = await db
    .from("email_confirmation_requests")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", windowStart);

  if (error) {
    throw databaseOperationError(
      "verificare il limite conferma email",
      error
    );
  }

  return count ?? 0;
}

async function recordEmailConfirmationRequest(params: {
  db: AppDbClient;
  emailHash: string;
  clientIpHash: string;
  status: EmailConfirmationRequestStatus;
  failureCode?: string;
}) {
  const { error } = await params.db.from("email_confirmation_requests").insert({
    email_hash: params.emailHash,
    client_ip_hash: params.clientIpHash,
    status: params.status,
    failure_code: params.failureCode ?? null,
  });

  if (error) {
    console.warn("[email-confirmation] audit insert failed", {
      status: params.status,
      code: getEmailConfirmationFailureCode(error),
    });
  }
}

async function findSupabaseAuthUserByEmail(db: AppDbClient, email: string) {
  const { data: profile, error } = await db
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw databaseOperationError("verificare l'account", error);
  }

  if (!profile?.id) return null;

  const { data, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(profile.id);

  if (authError) {
    throw databaseOperationError(
      "verificare lo stato dell'account",
      authError
    );
  }

  return data.user;
}

async function requestEmailConfirmationDelivery(params: {
  db: AppDbClient;
  email: string;
  clientIp: string;
  request: Request;
}): Promise<{
  success: boolean;
  status: EmailConfirmationDeliveryStatus;
  message: string;
}> {
  const emailHash = hashEmailConfirmationIdentifier(params.email);
  const hasClientIp = params.clientIp !== "unknown";
  const clientIpHash = hashEmailConfirmationIdentifier(params.clientIp);
  const windowStart = getEmailConfirmationWindowStart();
  const [emailRequestCount, clientIpRequestCount] = await Promise.all([
    countRecentEmailConfirmationRequests(
      params.db,
      "email_hash",
      emailHash,
      windowStart
    ),
    hasClientIp
      ? countRecentEmailConfirmationRequests(
          params.db,
          "client_ip_hash",
          clientIpHash,
          windowStart
        )
      : Promise.resolve(0),
  ]);

  if (
    isEmailConfirmationRateLimited({
      emailRequestCount,
      clientIpRequestCount,
      hasClientIp,
    })
  ) {
    await recordEmailConfirmationRequest({
      db: params.db,
      emailHash,
      clientIpHash,
      status: "rate_limited",
    });
    return {
      success: false,
      status: "rate_limited",
      message: EMAIL_CONFIRMATION_RATE_LIMITED_MESSAGE,
    };
  }

  const user = await findSupabaseAuthUserByEmail(params.db, params.email);
  if (!user) {
    await recordEmailConfirmationRequest({
      db: params.db,
      emailHash,
      clientIpHash,
      status: "suppressed",
      failureCode: "account_not_found",
    });
    return {
      success: false,
      status: "not_found",
      message: EMAIL_CONFIRMATION_NOT_FOUND_MESSAGE,
    };
  }

  if (isSupabaseUserEmailConfirmed(user)) {
    await recordEmailConfirmationRequest({
      db: params.db,
      emailHash,
      clientIpHash,
      status: "suppressed",
      failureCode: "already_confirmed",
    });
    return {
      success: true,
      status: "already_confirmed",
      message: EMAIL_CONFIRMATION_ALREADY_CONFIRMED_MESSAGE,
    };
  }

  let status: EmailConfirmationRequestStatus = "sent";
  let failureCode: string | undefined;
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: params.email,
      options: {
        emailRedirectTo: buildEmailConfirmationRedirectUrl(params.request),
      },
    });

    if (error) {
      status = "failed";
      failureCode = getEmailConfirmationFailureCode(error);
      console.warn("[email-confirmation] Supabase resend failed", {
        code: failureCode,
      });
    }
  } catch (error) {
    status = "failed";
    failureCode = getEmailConfirmationFailureCode(error);
    console.warn("[email-confirmation] Supabase resend failed", {
      code: failureCode,
    });
  }

  await recordEmailConfirmationRequest({
    db: params.db,
    emailHash,
    clientIpHash,
    status,
    failureCode,
  });

  if (status === "failed") {
    return {
      success: false,
      status: "failed",
      message: EMAIL_CONFIRMATION_SEND_FAILED_MESSAGE,
    };
  }

  return {
    success: true,
    status: "sent",
    message: EMAIL_CONFIRMATION_RESENT_MESSAGE,
  };
}

export const authRouter = createRouter({
  supabasePublicConfig: publicQuery.query(() => {
    if (!supabaseConfigured) {
      throw userFacingError(
        "SERVICE_UNAVAILABLE",
        "Autenticazione temporaneamente non disponibile: Supabase non configurato."
      );
    }

    return {
      supabaseUrl: env.supabaseUrl,
      supabasePublishableKey: env.supabasePublishableKey,
    };
  }),
  registerWithCredentials: publicQuery
    .input(credentialsSchema)
    .mutation(async ({ input, ctx }) => {
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
        options: {
          data: { name: profileName },
          emailRedirectTo: buildEmailConfirmationRedirectUrl(ctx.req),
        },
      });
      if (error || !data.user)
        throw userFacingError(
          "BAD_REQUEST",
          error?.message
            ? `Registrazione non riuscita: ${error.message}`
            : "Registrazione non riuscita: controlla email e password e riprova.",
          error
        );

      if (isObfuscatedExistingSupabaseUser(data.user)) {
        return { success: true, verificationRequired: true };
      }

      const appDatabase = adminAppDb();
      const unionId = `supabase:${data.user.id}`;
      await upsertUser({
        unionId,
        email: input.email,
        name: profileName,
        lastSignInAt: new Date(),
        role: "user",
        piano: PUBLIC_INITIAL_PLAN,
      });
      const requestedPlan = PUBLIC_INITIAL_PLAN;
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
  resendEmailConfirmation: publicQuery
    .input(emailConfirmationRequestSchema)
    .mutation(async ({ input, ctx }) => {
      if (!supabaseConfigured || !supabaseAdminConfigured) {
        throw userFacingError(
          "SERVICE_UNAVAILABLE",
          "Conferma email temporaneamente non disponibile: autenticazione non configurata."
        );
      }

      return requestEmailConfirmationDelivery({
        db: adminAppDb(),
        email: input.email,
        clientIp: ctx.clientIp,
        request: ctx.req,
      });
    }),
  requestPasswordReset: publicQuery
    .input(passwordResetRequestSchema)
    .mutation(async ({ input, ctx }) => {
      if (!supabaseConfigured || !supabaseAdminConfigured) {
        throw userFacingError(
          "SERVICE_UNAVAILABLE",
          "Recupero password temporaneamente non disponibile: autenticazione non configurata."
        );
      }

      const appDatabase = adminAppDb();
      const emailHash = hashPasswordResetIdentifier(input.email);
      const hasClientIp = ctx.clientIp !== "unknown";
      const clientIpHash = hashPasswordResetIdentifier(ctx.clientIp);
      const windowStart = getPasswordResetWindowStart();
      const [emailRequestCount, clientIpRequestCount] = await Promise.all([
        countRecentPasswordResetRequests(
          appDatabase,
          "email_hash",
          emailHash,
          windowStart
        ),
        hasClientIp
          ? countRecentPasswordResetRequests(
              appDatabase,
              "client_ip_hash",
              clientIpHash,
              windowStart
            )
          : Promise.resolve(0),
      ]);

      if (
        isPasswordResetRateLimited({
          emailRequestCount,
          clientIpRequestCount,
          hasClientIp,
        })
      ) {
        await recordPasswordResetRequest({
          db: appDatabase,
          emailHash,
          clientIpHash,
          status: "rate_limited",
        });
        return { success: false, message: PASSWORD_RESET_RATE_LIMITED_MESSAGE };
      }

      const user = await findSupabaseAuthUserByEmail(appDatabase, input.email);
      if (!user) {
        await recordPasswordResetRequest({
          db: appDatabase,
          emailHash,
          clientIpHash,
          status: "suppressed",
          failureCode: "account_not_found",
        });
        return {
          success: false,
          message: PASSWORD_RESET_ACCOUNT_NOT_FOUND_MESSAGE,
        };
      }

      if (!isSupabaseUserEmailConfirmed(user)) {
        const confirmationResult = await requestEmailConfirmationDelivery({
          db: appDatabase,
          email: input.email,
          clientIp: ctx.clientIp,
          request: ctx.req,
        });
        await recordPasswordResetRequest({
          db: appDatabase,
          emailHash,
          clientIpHash,
          status: "suppressed",
          failureCode: `email_not_confirmed:${confirmationResult.status}`,
        });
        return {
          success: confirmationResult.success,
          message:
            confirmationResult.status === "sent"
              ? "Account non ancora confermato: ti abbiamo reinviato l'email di verifica."
              : `Account non ancora confermato. ${confirmationResult.message}`,
        };
      }

      const redirectTo = buildPasswordResetRedirectUrl(ctx.req);
      let status: PasswordResetRequestStatus = "sent";
      let failureCode: string | undefined;

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(
          input.email,
          {
            redirectTo,
          }
        );

        if (error) {
          status = "failed";
          failureCode = getPasswordResetFailureCode(error);
          console.warn("[password-reset] Supabase request failed", {
            code: failureCode,
          });
        }
      } catch (error) {
        status = "failed";
        failureCode = getPasswordResetFailureCode(error);
        console.warn("[password-reset] Supabase request failed", {
          code: failureCode,
        });
      }

      await recordPasswordResetRequest({
        db: appDatabase,
        emailHash,
        clientIpHash,
        status,
        failureCode,
      });

      return {
        success: status === "sent",
        message:
          status === "sent"
            ? PASSWORD_RESET_SUCCESS_MESSAGE
            : PASSWORD_RESET_SEND_FAILED_MESSAGE,
      };
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
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error || !data.user) {
        if (isSupabaseEmailNotConfirmedError(error)) {
          let message =
            "Email non ancora confermata. Apri il link nella mail di verifica, poi riprova ad accedere.";
          if (supabaseAdminConfigured) {
            try {
              const confirmationResult = await requestEmailConfirmationDelivery(
                {
                  db: adminAppDb(),
                  email: input.email,
                  clientIp: ctx.clientIp,
                  request: ctx.req,
                }
              );
              message =
                confirmationResult.status === "sent"
                  ? "Email non ancora confermata: ti abbiamo reinviato l'email di verifica."
                  : `Email non ancora confermata. ${confirmationResult.message}`;
            } catch (resendError) {
              console.warn(
                "[email-confirmation] login-triggered resend failed",
                {
                  code: getEmailConfirmationFailureCode(resendError),
                }
              );
            }
          }
          throw userFacingError(
            "UNAUTHORIZED",
            message
          );
        }

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
      if (data.session) {
        appendSupabaseSessionCookies(
          ctx.req.headers,
          ctx.resHeaders,
          data.session
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
      appendClearedSupabaseSessionCookies(ctx.req.headers, ctx.resHeaders);

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
    appendClearedSupabaseSessionCookies(ctx.req.headers, ctx.resHeaders);
    return { success: true };
  }),
});
