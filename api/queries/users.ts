import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import { getDb } from "./connection";

function removeUndefinedFields<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb().select().from(schema.users).where(eq(schema.users.unionId, unionId)).limit(1);
  return rows.at(0);
}

export async function findUserByEmail(email: string) {
  const rows = await getDb().select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser) {
  const cleanedData = removeUndefinedFields(data);
  const now = new Date();

  await getDb()
    .insert(schema.users)
    .values({ ...cleanedData, lastSignInAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.users.unionId,
      set: { ...cleanedData, lastSignInAt: now, updatedAt: now },
    });
}
