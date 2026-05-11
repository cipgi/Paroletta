import { TRPCError } from "@trpc/server";
import { appDb } from "./db";
import { databaseOperationError } from "./errors";

export type ActiveSubscription = {
  status: string;
  plan: string;
  created_at: string | null;
  current_period_end: string | null;
};

export async function assertActiveSubscription(params: {
  ownerUserId: string;
  accessToken?: string;
}): Promise<ActiveSubscription> {
  const { data: subscription, error } = await appDb(params.accessToken)
    .from("subscriptions")
    .select("status,plan,created_at,current_period_end")
    .eq("user_id", params.ownerUserId)
    .maybeSingle();

  if (error) {
    throw databaseOperationError("verificare il tuo abbonamento", error);
  }

  const nowMs = Date.now();
  const trialStartedAt = subscription?.created_at
    ? new Date(subscription.created_at).getTime()
    : nowMs;
  const trialEndsAt = trialStartedAt + 15 * 24 * 60 * 60 * 1000;
  const hasTrialAccess =
    subscription?.status === "trial" && nowMs <= trialEndsAt;
  const hasActiveSubscription =
    subscription?.status === "attivo" &&
    (subscription.current_period_end
      ? new Date(subscription.current_period_end).getTime() >= nowMs
      : true);

  if (!subscription || (!hasActiveSubscription && !hasTrialAccess)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Il tuo abbonamento non è attivo. Riattivalo dalle impostazioni per continuare.",
    });
  }

  return subscription;
}
