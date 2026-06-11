import { TRPCError } from "@trpc/server";
import { adminAppDb, appDb } from "./db";
import { databaseOperationError } from "./errors";

export type ActiveSubscription = {
  status: string;
  plan: string;
  created_at: string | null;
  current_period_end: string | null;
};

export type PlanLimits = {
  sheetLimit: number;
  imageLimit: number;
  durationDays: number;
  isTrial: boolean;
};

export type UsageSummary = {
  plan: string;
  sheets: {
    used: number;
    limit: number;
    remaining: number;
  };
  images: {
    used: number;
    limit: number;
    remaining: number;
  };
};

type RpcClient = {
  rpc(
    functionName: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown }>;
};

function getErrorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const fields = ["message", "details", "hint", "code"] as const;
  return fields
    .map(field => {
      const value = error[field as keyof typeof error];
      return typeof value === "string" ? value : "";
    })
    .join(" ");
}

function isDatabaseSignal(error: unknown, signal: string) {
  return getErrorText(error).includes(signal);
}

function forbiddenLimitError(kind: "schede" | "immagini", limit: number) {
  return new TRPCError({
    code: "FORBIDDEN",
    message: `Hai raggiunto il limite di ${limit} ${kind} per il tuo piano. Passa a un piano superiore per continuare.`,
  });
}

export async function getPlanLimits(
  plan: string,
  accessToken?: string
): Promise<PlanLimits> {
  const { data, error } = await appDb(accessToken)
    .from("subscription_plans")
    .select("sheet_limit,image_limit,duration_days,is_trial")
    .eq("code", plan)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw databaseOperationError("caricare i limiti del piano", error);
  }

  return {
    sheetLimit: data?.sheet_limit ?? 5,
    imageLimit: data?.image_limit ?? data?.sheet_limit ?? 5,
    durationDays: data?.duration_days ?? 30,
    isTrial: data?.is_trial ?? plan === "trial",
  };
}

export async function getUsageSummary(params: {
  ownerUserId: string;
  plan: string;
  accessToken?: string;
}): Promise<UsageSummary> {
  const limits = await getPlanLimits(params.plan, params.accessToken);
  const { data, error } = await appDb(params.accessToken)
    .from("profiles")
    .select("trial_schede_usate,schede_mese,trial_immagini_usate,immagini_mese")
    .eq("id", params.ownerUserId)
    .maybeSingle();

  if (error) {
    throw databaseOperationError("leggere l’utilizzo del piano", error);
  }

  const sheetUsed =
    params.plan === "trial"
      ? (data?.trial_schede_usate ?? 0)
      : (data?.schede_mese ?? 0);
  const imageUsed =
    params.plan === "trial"
      ? (data?.trial_immagini_usate ?? 0)
      : (data?.immagini_mese ?? 0);

  return {
    plan: params.plan,
    sheets: {
      used: sheetUsed,
      limit: limits.sheetLimit,
      remaining: Math.max(limits.sheetLimit - sheetUsed, 0),
    },
    images: {
      used: imageUsed,
      limit: limits.imageLimit,
      remaining: Math.max(limits.imageLimit - imageUsed, 0),
    },
  };
}

export function assertSheetLimitAvailable(summary: UsageSummary) {
  if (summary.sheets.used >= summary.sheets.limit) {
    throw forbiddenLimitError("schede", summary.sheets.limit);
  }
}

export async function reserveImageGenerationQuota(params: {
  userId: string;
  plan?: string;
  accessToken?: string;
}): Promise<() => Promise<void>> {
  const rpc = adminAppDb() as unknown as RpcClient;
  const { error } = await rpc.rpc("consume_image_usage", {
    target_user_id: params.userId,
    image_count: 1,
  });

  if (error) {
    if (isDatabaseSignal(error, "image_limit_reached")) {
      const limit = params.plan
        ? (await getPlanLimits(params.plan, params.accessToken)).imageLimit
        : 0;
      throw forbiddenLimitError("immagini", limit);
    }
    throw databaseOperationError("aggiornare il conteggio immagini", error);
  }

  return async () => {
    const { error: rollbackError } = await rpc.rpc("release_image_usage", {
      target_user_id: params.userId,
      image_count: 1,
    });
    if (rollbackError) {
      console.error("[subscription] image quota rollback failed", {
        userId: params.userId,
        error: rollbackError,
      });
    }
  };
}

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
