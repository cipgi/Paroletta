import { nextUserId, users, type User } from "../store";

type InsertUser = Omit<User, "id" | "piano" | "seats" | "trialSchedeUsate" | "schedeMese"> & Partial<Pick<User,"piano"|"seats"|"trialSchedeUsate"|"schedeMese">>;

export async function findUserByUnionId(unionId: string) {
  return users.find((u) => u.unionId === unionId);
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
