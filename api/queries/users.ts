import { nextUserId, users, type User } from "../store";
import { appDb } from "../lib/db";
import { sanitizeProfileNameOrFallback } from "../lib/sanitize";
import { getAccountContext } from "../lib/organization";

type InsertUser = Omit<
  User,
  "id" | "piano" | "seats" | "trialSchedeUsate" | "schedeMese"
> &
  Partial<Pick<User, "piano" | "seats" | "trialSchedeUsate" | "schedeMese">>;

export async function findUserByUnionId(unionId: string) {
  const cachedUser = users.find(u => u.unionId === unionId);

  if (!unionId.startsWith("supabase:")) {
    return cachedUser;
  }

  const supabaseUserId = unionId.slice("supabase:".length);
  if (!supabaseUserId) {
    return cachedUser;
  }

  const { data: profile, error } = await appDb()
    .from("profiles")
    .select(
      "email,name,first_name,last_name,role,piano,seats,trial_schede_usate,schede_mese"
    )
    .eq("id", supabaseUserId)
    .maybeSingle();

  if (error) {
    return cachedUser;
  }

  if (!profile) {
    const authEmail = cachedUser?.email;
    const fallbackName = sanitizeProfileNameOrFallback(
      cachedUser?.name,
      authEmail ? authEmail.split("@")[0] : "Utente"
    );
    const { data: repairedProfile, error: repairError } = await appDb()
      .from("profiles")
      .upsert(
        {
          id: supabaseUserId,
          email: authEmail ?? "",
          name: fallbackName,
        },
        { onConflict: "id" }
      )
      .select(
        "email,name,first_name,last_name,role,piano,seats,trial_schede_usate,schede_mese"
      )
      .maybeSingle();

    if (repairError || !repairedProfile) {
      return cachedUser;
    }

    const account = await getAccountContext(supabaseUserId);

    return {
      id: cachedUser?.id ?? nextUserId(),
      unionId,
      email: repairedProfile.email,
      name: sanitizeProfileNameOrFallback(
        repairedProfile.name,
        repairedProfile.email?.split("@")[0] ?? "Utente"
      ),
      firstName: repairedProfile.first_name,
      lastName: repairedProfile.last_name,
      role: repairedProfile.role ?? cachedUser?.role ?? "user",
      accountRole: account.role,
      organizationOwnerId: account.ownerUserId,
      piano: (repairedProfile.piano ?? "trial") as User["piano"],
      seats: repairedProfile.seats ?? 1,
      trialSchedeUsate: repairedProfile.trial_schede_usate ?? 0,
      schedeMese: repairedProfile.schede_mese ?? 0,
      lastSignInAt: cachedUser?.lastSignInAt,
    };
  }

  const account = await getAccountContext(supabaseUserId);

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
    piano: data.piano ?? "trial",
    seats: data.seats ?? 1,
    trialSchedeUsate: data.trialSchedeUsate ?? 0,
    schedeMese: data.schedeMese ?? 0,
    lastSignInAt: new Date(),
  });
}
