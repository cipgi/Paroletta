import { TRPCError } from "@trpc/server";
import { appDb } from "./db";
import { databaseOperationError } from "./errors";

export type AccountRole = "manager" | "staff";

export type AccountContext = {
  userId: string;
  ownerUserId: string;
  role: AccountRole;
};

export async function getAccountContext(
  userId: string,
  accessToken?: string
): Promise<AccountContext> {
  const { data, error } = await appDb(accessToken)
    .from("seat_assignments")
    .select("owner_user_id")
    .eq("member_user_id", userId)
    .maybeSingle();

  if (error)
    throw databaseOperationError(
      "verificare il ruolo nell’organizzazione",
      error
    );

  return {
    userId,
    ownerUserId: data?.owner_user_id ?? userId,
    role: data?.owner_user_id ? "staff" : "manager",
  };
}

export async function requireManager(
  userId: string,
  accessToken?: string
): Promise<AccountContext> {
  const account = await getAccountContext(userId, accessToken);
  if (account.role !== "manager") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo l'account Manager può accedere a questa funzione.",
    });
  }
  return account;
}
