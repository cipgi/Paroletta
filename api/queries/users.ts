import { nextUserId, users, type User } from "../store";
import { appDb } from "../lib/db";

type InsertUser = Omit<User, "id" | "piano" | "seats" | "trialSchedeUsate" | "schedeMese"> & Partial<Pick<User,"piano"|"seats"|"trialSchedeUsate"|"schedeMese">>;

export async function findUserByUnionId(unionId: string) {
  const cachedUser = users.find((u) => u.unionId === unionId);

  if (!unionId.startsWith("supabase:")) {
    return cachedUser;
  }

  const supabaseUserId = unionId.slice("supabase:".length);
  if (!supabaseUserId) {
    return cachedUser;
  }

  const { data: profile, error } = await appDb()
    .from("profiles")
    .select("email,name,first_name,last_name,piano,seats,trial_schede_usate,schede_mese")
    .eq("id", supabaseUserId)
    .maybeSingle();

  if (error || !profile) {
    return cachedUser;
  }

  return {
    id: cachedUser?.id ?? nextUserId(),
    unionId,
    email: profile.email,
    name: profile.name,
    firstName: profile.first_name,
    lastName: profile.last_name,
    role: cachedUser?.role ?? "user",
    piano: (profile.piano ?? "trial") as User["piano"],
    seats: profile.seats ?? 1,
    trialSchedeUsate: profile.trial_schede_usate ?? 0,
    schedeMese: profile.schede_mese ?? 0,
    lastSignInAt: cachedUser?.lastSignInAt,
  };
}

export async function findUserByEmail(email: string) {
  return users.find((u) => u.email === email);
}

export async function upsertUser(data: InsertUser) {
  const existing = users.find((u) => u.unionId === data.unionId);
  if (existing) {
    Object.assign(existing, data, { lastSignInAt: new Date() });
    return;
  }
  users.push({
    id: nextUserId(),
    unionId: data.unionId,
    email: data.email,
    name: data.name,
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
