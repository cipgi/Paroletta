import { createRouter, authedQuery } from "./middleware";
import { appDb, getSupabaseUserIdFromUnionId } from "./lib/db";
import { databaseOperationError, invalidSessionError } from "./lib/errors";
import { getAccountContext } from "./lib/organization";
import { resolveSubscriptionAccess } from "./lib/subscription-access";
import type { Plan } from "./store";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw invalidSessionError();
  return id;
}

async function getOwnerProfile(ownerUserId: string, accessToken?: string) {
  const { data, error } = await appDb(accessToken)
    .from("profiles")
    .select("piano,seats,created_at,updated_at")
    .eq("id", ownerUserId)
    .single();

  if (error || !data) {
    throw databaseOperationError("caricare il profilo dell’abbonamento", error);
  }

  return data;
}

export const subscriptionsRouter = createRouter({
  mySubscription: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const account = await getAccountContext(
      supabaseUserId,
      ctx.supabaseAccessToken
    );
    const ownerProfile = await getOwnerProfile(
      account.ownerUserId,
      ctx.supabaseAccessToken
    );
    const { data, error } = await appDb(ctx.supabaseAccessToken)
      .from("subscriptions")
      .select(
        "id,user_id,status,plan,seats_count,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at"
      )
      .eq("user_id", account.ownerUserId)
      .maybeSingle();
    if (error) throw databaseOperationError("caricare l’abbonamento", error);
    const access = resolveSubscriptionAccess({
      subscription: data,
      profile: ownerProfile,
    });

    if (access.derivedFromProfile) {
      return {
        accountRole: account.role,
        ownerUserId: account.ownerUserId,
        id: data?.id ?? null,
        userId: account.ownerUserId,
        status: access.status,
        plan: access.plan as Plan,
        seatsCount: data?.seats_count ?? ownerProfile.seats ?? 1,
        currentPeriodStart:
          data?.current_period_start ?? ownerProfile.created_at,
        currentPeriodEnd: access.current_period_end,
        cancelAtPeriodEnd: false,
        createdAt: data?.created_at ?? ownerProfile.created_at,
        updatedAt: ownerProfile.updated_at,
        accessActive: access.accessActive,
        derivedFromProfile: true,
      };
    }

    return {
      accountRole: account.role,
      ownerUserId: account.ownerUserId,
      id: data?.id ?? null,
      userId: data?.user_id ?? account.ownerUserId,
      status: access.status,
      plan: access.plan as Plan,
      seatsCount: data?.seats_count ?? ownerProfile.seats ?? 1,
      currentPeriodStart: data?.current_period_start ?? ownerProfile.created_at,
      currentPeriodEnd: access.current_period_end,
      cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
      createdAt: data?.created_at ?? ownerProfile.created_at,
      updatedAt: data?.updated_at ?? ownerProfile.updated_at,
      accessActive: access.accessActive,
      derivedFromProfile: false,
    };
  }),
  plans: authedQuery.query(async ({ ctx }) => {
    const { data, error } = await appDb(ctx.supabaseAccessToken)
      .from("subscription_plans")
      .select(
        "code,name,description,sheet_limit,image_limit,duration_days,is_trial,active"
      )
      .eq("active", true)
      .eq("is_trial", false)
      .in("code", ["starter", "pro", "max"])
      .order("sheet_limit", { ascending: true })
      .order("image_limit", { ascending: true });
    if (error)
      throw databaseOperationError("caricare i piani disponibili", error);
    return (data ?? []).map(plan => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      sheetLimit: plan.sheet_limit,
      imageLimit: plan.image_limit,
      durationDays: plan.duration_days,
      isTrial: plan.is_trial,
      active: plan.active,
    }));
  }),
});
