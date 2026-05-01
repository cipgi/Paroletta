import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { env, supabaseConfigured } from "./lib/env";
import { supabase } from "./lib/supabase";
import { signSessionToken } from "./oauth/session";
import { upsertUser } from "./queries/users";

export async function handleSupabaseGoogleAuth(c: Context) {
  if (!supabaseConfigured) {
    return c.json({ error: "Autenticazione con Supabase non configurata" }, 503);
  }

  const redirectTo = `${new URL(c.req.url).origin}/api/auth/google/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data.url) {
    return c.json({ error: error?.message ?? "Errore avvio login Google" }, 500);
  }

  return c.redirect(data.url, 302);
}

export async function handleSupabaseGoogleCallback(c: Context) {
  if (!supabaseConfigured) {
    return c.json({ error: "Autenticazione con Supabase non configurata" }, 503);
  }

  const code = c.req.query("code");
  if (!code) {
    return c.json({ error: "Code mancante nella callback Google" }, 400);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return c.json({ error: error?.message ?? "Errore callback Google" }, 401);
  }

  const user = data.user;
  const userEmail = user.email ?? "";
  const userName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    (userEmail ? userEmail.split("@")[0] : "Utente");

  const unionId = `supabase:${user.id}`;
  await upsertUser({
    unionId,
    email: userEmail || undefined,
    name: userName,
    avatar: user.user_metadata?.avatar_url as string | undefined,
    lastSignInAt: new Date(),
    role: "user",
  });

  const token = await signSessionToken({ unionId, clientId: env.supabaseUrl || "supabase" });
  const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, token, {
    ...cookieOpts,
    maxAge: Session.maxAgeMs / 1000,
  });

  return c.redirect("/", 302);
}
