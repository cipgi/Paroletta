import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { appDb, getSupabaseUserIdFromUnionId } from "./lib/db";
import {
  databaseOperationError,
  invalidSessionError,
  missingResourceError,
  userFacingError,
} from "./lib/errors";
import { getAccountContext, requireManager } from "./lib/organization";
import type { Plan } from "./store";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw invalidSessionError();
  return id;
}

export const subscriptionsRouter = createRouter({
  cancel: authedQuery.mutation(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    await requireManager(supabaseUserId);
    const { data: currentSub } = await appDb()
      .from("subscriptions")
      .select("plan,current_period_end")
      .eq("user_id", supabaseUserId)
      .maybeSingle();
    const { error: subError } = await appDb()
      .from("subscriptions")
      .upsert(
        {
          user_id: supabaseUserId,
          status: "cancellato",
          plan: currentSub?.plan ?? "base",
          seats_count: 1,
          cancel_at_period_end: true,
          current_period_end:
            currentSub?.current_period_end ?? new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (subError)
      throw databaseOperationError("annullare l’abbonamento", subError);
    return { success: true };
  }),
  mySubscription: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const account = await getAccountContext(supabaseUserId);
    const { data, error } = await appDb()
      .from("subscriptions")
      .select(
        "id,user_id,status,plan,seats_count,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at"
      )
      .eq("user_id", account.ownerUserId)
      .maybeSingle();
    if (error) throw databaseOperationError("caricare l’abbonamento", error);
    if (!data) {
      const { data: ownerProfile, error: profileError } = await appDb()
        .from("profiles")
        .select("piano,seats,created_at,updated_at")
        .eq("id", account.ownerUserId)
        .single();
      if (profileError || !ownerProfile) {
        throw databaseOperationError(
          "caricare il profilo dell’abbonamento",
          profileError
        );
      }

      const plan = (ownerProfile.piano ?? "trial") as Plan;
      const status = plan === "trial" ? "trial" : "attivo";

      return {
        accountRole: account.role,
        ownerUserId: account.ownerUserId,
        id: null,
        userId: account.ownerUserId,
        status,
        plan,
        seatsCount: ownerProfile.seats ?? 1,
        currentPeriodStart: ownerProfile.created_at,
        currentPeriodEnd: status === "attivo" ? null : ownerProfile.updated_at,
        cancelAtPeriodEnd: false,
        createdAt: ownerProfile.created_at,
        updatedAt: ownerProfile.updated_at,
        derivedFromProfile: true,
      };
    }
    return {
      accountRole: account.role,
      ownerUserId: account.ownerUserId,
      id: data.id,
      userId: data.user_id,
      status: data.status,
      plan: data.plan,
      seatsCount: data.seats_count,
      currentPeriodStart: data.current_period_start,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }),
  plans: authedQuery.query(async () => {
    const { data, error } = await appDb()
      .from("subscription_plans")
      .select("code,name,description,sheet_limit,duration_days,is_trial,active")
      .eq("active", true)
      .neq("code", "dev")
      .order("is_trial", { ascending: false });
    if (error)
      throw databaseOperationError("caricare i piani disponibili", error);
    return (data ?? []).map(plan => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      sheetLimit: plan.sheet_limit,
      durationDays: plan.duration_days,
      isTrial: plan.is_trial,
      active: plan.active,
    }));
  }),
  updatePlan: authedQuery
    .input(
      z.object({
        piano: z.enum(["trial", "base", "dev"]),
        seatsCount: z.number().min(1).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      await requireManager(supabaseUserId);
      const seatsCount = input.seatsCount ?? 1;
      const { data: selectedPlan, error: selectedPlanError } = await appDb()
        .from("subscription_plans")
        .select("code,sheet_limit,duration_days,is_trial,active")
        .eq("code", input.piano)
        .eq("active", true)
        .maybeSingle();
      if (selectedPlanError)
        throw databaseOperationError(
          "verificare il piano selezionato",
          selectedPlanError
        );
      if (!selectedPlan) throw missingResourceError("Piano selezionato");

      const { data: existingSub, error: existingSubError } = await appDb()
        .from("subscriptions")
        .select("status,plan,created_at,current_period_start")
        .eq("user_id", supabaseUserId)
        .maybeSingle();
      if (existingSubError)
        throw databaseOperationError(
          "verificare il tuo abbonamento attuale",
          existingSubError
        );
      if (selectedPlan.is_trial && existingSub) {
        throw userFacingError(
          "BAD_REQUEST",
          "Il trial può essere attivato una sola volta per account."
        );
      }

      const plan = input.piano satisfies Plan;
      const { error: profileError } = await appDb()
        .from("profiles")
        .update({ piano: plan, seats: seatsCount })
        .eq("id", supabaseUserId);
      if (profileError)
        throw databaseOperationError(
          "aggiornare il profilo con il nuovo piano",
          profileError
        );
      const status = selectedPlan.is_trial ? "trial" : "attivo";
      const now = new Date().toISOString();
      const periodEnd = new Date(
        Date.now() + selectedPlan.duration_days * 24 * 60 * 60 * 1000
      ).toISOString();
      const { error: subError } = await appDb()
        .from("subscriptions")
        .upsert(
          {
            user_id: supabaseUserId,
            status,
            plan,
            seats_count: seatsCount,
            current_period_start: existingSub?.current_period_start ?? now,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
          },
          { onConflict: "user_id" }
        );
      if (subError)
        throw databaseOperationError("salvare il nuovo abbonamento", subError);
      ctx.user.piano = plan;
      ctx.user.seats = seatsCount;
      return { piano: plan, limit: selectedPlan.sheet_limit };
    }),
});
