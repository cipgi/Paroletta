import { TRPCError } from "@trpc/server";
import { appDb } from "./db";
import { databaseOperationError } from "./errors";

export type AccountRole = "manager" | "staff" | "single";

export type AccountContext = {
  userId: string;
  ownerUserId: string;
  role: AccountRole;
};

export async function getAccountContext(
  userId: string,
  accessToken?: string
): Promise<AccountContext> {
  const { data: seat, error: seatError } = await appDb(accessToken)
    .from("seat_assignments")
    .select("owner_user_id")
    .eq("member_user_id", userId)
    .maybeSingle();

  if (seatError)
    throw databaseOperationError(
      "verificare il ruolo nell’organizzazione",
      seatError
    );

  if (seat?.owner_user_id) {
    return {
      userId,
      ownerUserId: seat.owner_user_id,
      role: "staff",
    };
  }

  const { data: profile, error: profileError } = await appDb(accessToken)
    .from("profiles")
    .select("is_team_manager")
    .eq("id", userId)
    .maybeSingle();

  if (profileError)
    throw databaseOperationError(
      "verificare i permessi di gestione team",
      profileError
    );

  return {
    userId,
    ownerUserId: userId,
    role: profile?.is_team_manager ? "manager" : "single",
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
      message:
        "Solo un account impostato come Manager può accedere a questa funzione.",
    });
  }
  return account;
}

export async function requireAccountOwner(
  userId: string,
  accessToken?: string
): Promise<AccountContext> {
  const account = await getAccountContext(userId, accessToken);
  if (account.role === "staff") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Questa funzione è gestita dall'account principale del team.",
    });
  }
  return account;
}
