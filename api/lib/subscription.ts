import { TRPCError } from "@trpc/server";
import { adminAppDb, appDb } from "./db";
import { databaseOperationError } from "./errors";
import {
  type ActiveSubscription,
  resolveSubscriptionAccess,
} from "./subscription-access";

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

const PLAN_LIMIT_FALLBACKS: Record<string, PlanLimits> = {
  trial: { sheetLimit: 15, imageLimit: 15, durationDays: 15, isTrial: true },
  nessun_abbonamento: {
    sheetLimit: 0,
    imageLimit: 0,
    durationDays: 365,
    isTrial: false,
  },
};

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
    sheetLimit:
      data?.sheet_limit ?? PLAN_LIMIT_FALLBACKS[plan]?.sheetLimit ?? 5,
    imageLimit:
      data?.image_limit ??
      data?.sheet_limit ??
      PLAN_LIMIT_FALLBACKS[plan]?.imageLimit ??
      5,
    durationDays:
      data?.duration_days ?? PLAN_LIMIT_FALLBACKS[plan]?.durationDays ?? 30,
    isTrial: data?.is_trial ?? PLAN_LIMIT_FALLBACKS[plan]?.isTrial ?? false,
  };
}

async function getUsagePoolOwnerId(userId: string, accessToken?: string) {
  const { data, error } = await appDb(accessToken)
    .from("seat_assignments")
    .select("owner_user_id")
    .eq("member_user_id", userId)
    .maybeSingle();

  if (error) {
    throw databaseOperationError("identificare il pool di utilizzo", error);
  }

  return data?.owner_user_id ?? userId;
}

async function getActiveTeamMemberCount(
  ownerUserId: string,
  accessToken?: string
) {
  const { count, error } = await appDb(accessToken)
    .from("seat_assignments")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId);

  if (error) {
    throw databaseOperationError("contare i membri attivi del team", error);
  }

  return 1 + (count ?? 0);
}

export async function getUsageSummary(params: {
  ownerUserId: string;
  plan: string;
  accessToken?: string;
}): Promise<UsageSummary> {
  const limits = await getPlanLimits(params.plan, params.accessToken);
  const activeTeamMemberCount = await getActiveTeamMemberCount(
    params.ownerUserId,
    params.accessToken
  );
  const pooledSheetLimit = limits.sheetLimit * activeTeamMemberCount;
  const pooledImageLimit = limits.imageLimit * activeTeamMemberCount;
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
      limit: pooledSheetLimit,
      remaining: Math.max(pooledSheetLimit - sheetUsed, 0),
    },
    images: {
      used: imageUsed,
      limit: pooledImageLimit,
      remaining: Math.max(pooledImageLimit - imageUsed, 0),
    },
  };
}

export function assertSheetLimitAvailable(summary: UsageSummary) {
  if (summary.sheets.used >= summary.sheets.limit) {
    throw forbiddenLimitError("schede", summary.sheets.limit);
  }
}

export async function reserveSheetGenerationQuota(params: {
  userId: string;
  plan?: string;
  accessToken?: string;
}): Promise<() => Promise<void>> {
  const rpc = adminAppDb() as unknown as RpcClient;
  const { error } = await rpc.rpc("consume_sheet_usage", {
    target_user_id: params.userId,
    sheet_count: 1,
  });

  if (error) {
    if (isDatabaseSignal(error, "sheet_limit_reached")) {
      const ownerUserId = await getUsagePoolOwnerId(
        params.userId,
        params.accessToken
      );
      const limit = params.plan
        ? (
            await getUsageSummary({
              ownerUserId,
              plan: params.plan,
              accessToken: params.accessToken,
            })
          ).sheets.limit
        : 0;
      throw forbiddenLimitError("schede", limit);
    }
    throw databaseOperationError("aggiornare il conteggio schede", error);
  }

  return async () => {
    const { error: rollbackError } = await rpc.rpc("release_sheet_usage", {
      target_user_id: params.userId,
      sheet_count: 1,
    });
    if (rollbackError) {
      console.error("[subscription] sheet quota rollback failed", {
        userId: params.userId,
        error: rollbackError,
      });
    }
  };
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
      const ownerUserId = await getUsagePoolOwnerId(
        params.userId,
        params.accessToken
      );
      const limit = params.plan
        ? (
            await getUsageSummary({
              ownerUserId,
              plan: params.plan,
              accessToken: params.accessToken,
            })
          ).images.limit
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
  const { data: profile, error: profileError } = await appDb(params.accessToken)
    .from("profiles")
    .select("piano,created_at,updated_at")
    .eq("id", params.ownerUserId)
    .maybeSingle();

  if (profileError) {
    throw databaseOperationError(
      "verificare il profilo abbonamento",
      profileError
    );
  }

  const { data: subscription, error } = await appDb(params.accessToken)
    .from("subscriptions")
    .select("status,plan,created_at,current_period_end")
    .eq("user_id", params.ownerUserId)
    .maybeSingle();

  if (error) {
    throw databaseOperationError("verificare il tuo abbonamento", error);
  }

  const nowMs = Date.now();
  const access = resolveSubscriptionAccess({
    subscription,
    profile,
    nowMs,
  });

  if (!access.accessActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Il tuo abbonamento non è attivo. Contatta il supporto per verificare il piano.",
    });
  }

  return {
    status: access.status,
    plan: access.plan,
    created_at: access.created_at,
    current_period_end: access.current_period_end,
  };
}
