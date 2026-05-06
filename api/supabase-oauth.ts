import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { env, supabaseConfigured } from "./lib/env";
import { supabase } from "./lib/supabase";
import { signSessionToken } from "./oauth/session";
import { upsertUser } from "./queries/users";
import { appDb } from "./lib/db";
import { sanitizeProfileNameOrFallback } from "./lib/sanitize";
import { getSafeHttpErrorBody, logServerError } from "./lib/errors";

export async function handleSupabaseGoogleAuth(c: Context) {
  if (!supabaseConfigured) {
    logServerError(new Error("Supabase authentication is not configured"), {
      method: c.req.method,
      url: c.req.url,
    });
    return c.json(getSafeHttpErrorBody(503), 503);
  }

  const redirectTo = `${new URL(c.req.url).origin}/api/auth/google/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data.url) {
    logServerError(error ?? new Error("Missing Supabase OAuth redirect URL"), {
      method: c.req.method,
      url: c.req.url,
    });
    return c.json(getSafeHttpErrorBody(500), 500);
  }

  return c.redirect(data.url, 302);
}

export async function handleSupabaseGoogleCallback(c: Context) {
  if (!supabaseConfigured) {
    logServerError(new Error("Supabase authentication is not configured"), {
      method: c.req.method,
      url: c.req.url,
    });
    return c.json(getSafeHttpErrorBody(503), 503);
  }

  const code = c.req.query("code");
  if (!code) {
    return c.json(getSafeHttpErrorBody(400), 400);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    logServerError(error ?? new Error("Missing Supabase OAuth callback user"), {
      method: c.req.method,
      url: c.req.url,
    });
    return c.json(getSafeHttpErrorBody(401), 401);
  }

  const user = data.user;
  const userEmail = user.email ?? "";
  const userName = sanitizeProfileNameOrFallback(
    (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined),
    userEmail ? userEmail.split("@")[0] : "Utente"
  );

  const unionId = `supabase:${user.id}`;
  await upsertUser({
    unionId,
    email: userEmail,
    name: userName,
    lastSignInAt: new Date(),
    role: "user",
  });
  const { error: profileError } = await appDb().from("profiles").upsert(
    {
      id: user.id,
      email: userEmail,
      name: userName,
    },
    { onConflict: "id" }
  );
  if (profileError) {
    logServerError(profileError, { method: c.req.method, url: c.req.url });
    return c.json(getSafeHttpErrorBody(500), 500);
  }

  const token = await signSessionToken({
    unionId,
    clientId: env.supabaseUrl || "supabase",
  });
  const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, token, {
    ...cookieOpts,
    maxAge: Session.maxAgeMs / 1000,
  });

  return c.redirect("/", 302);
}
