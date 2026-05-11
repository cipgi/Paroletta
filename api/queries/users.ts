import { nextUserId, users, type User } from "../store";
import { appDb } from "../lib/db";
import { sanitizeProfileNameOrFallback } from "../lib/sanitize";
import { getAccountContext } from "../lib/organization";

type InsertUser = Omit<
  User,
  "id" | "piano" | "seats" | "trialSchedeUsate" | "schedeMese"
> &
  Partial<Pick<User, "piano" | "seats" | "trialSchedeUsate" | "schedeMese">>;

export async function findUserByUnionId(unionId: string, accessToken?: string) {
  const cachedUser = users.find(u => u.unionId === unionId);

  if (!unionId.startsWith("supabase:")) {
    return cachedUser;
  }

  const supabaseUserId = unionId.slice("supabase:".length);
  if (!supabaseUserId) {
    return cachedUser;
  }

  const { data: profile, error } = await appDb(accessToken)
    .from("profiles")
    .select(
      "email,name,first_name,last_name,role,is_team_manager,piano,seats,trial_schede_usate,schede_mese"
    )
    .eq("id", supabaseUserId)
    .maybeSingle();

  if (error) {
    return cachedUser;
  }

  if (!profile) {
    // Resolving the authenticated user is intentionally read-only. Missing
    // profiles should be created during registration or fixed by maintenance,
    // not silently repaired during login/session reads.
    return cachedUser;
  }

  const account = await getAccountContext(supabaseUserId, accessToken);

  return {
    id: cachedUser?.id ?? nextUserId(),
    unionId,
    email: profile.email,
    name: sanitizeProfileNameOrFallback(
      profile.name,
      profile.email?.split("@")[0] ?? "Utente"
    ),
    firstName: profile.first_name,
    lastName: profile.last_name,
    role: profile.role ?? cachedUser?.role ?? "user",
    accountRole: account.role,
    organizationOwnerId: account.ownerUserId,
    isTeamManager: profile.is_team_manager ?? false,
    piano: (profile.piano ?? "trial") as User["piano"],
    seats: profile.seats ?? 1,
    trialSchedeUsate: profile.trial_schede_usate ?? 0,
    schedeMese: profile.schede_mese ?? 0,
    lastSignInAt: cachedUser?.lastSignInAt,
  };
}

export async function findUserByEmail(email: string) {
  return users.find(u => u.email === email);
}

export async function upsertUser(data: InsertUser) {
  const safeName = sanitizeProfileNameOrFallback(
    data.name,
    data.email?.split("@")[0] ?? "Utente"
  );
  const existing = users.find(u => u.unionId === data.unionId);
  if (existing) {
    Object.assign(existing, data, { name: safeName, lastSignInAt: new Date() });
    return;
  }
  users.push({
    id: nextUserId(),
    unionId: data.unionId,
    email: data.email,
    name: safeName,
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    role: data.role ?? "user",
    isTeamManager: data.isTeamManager ?? false,
    piano: data.piano ?? "trial",
    seats: data.seats ?? 1,
    trialSchedeUsate: data.trialSchedeUsate ?? 0,
    schedeMese: data.schedeMese ?? 0,
    lastSignInAt: new Date(),
  });
}
