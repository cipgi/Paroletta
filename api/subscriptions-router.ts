import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { appDb, getSupabaseUserIdFromUnionId } from "./lib/db";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw new Error("Utente Supabase non valido");
  return id;
}

export const subscriptionsRouter = createRouter({
  cancel: authedQuery.mutation(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { data: currentSub } = await appDb().from("subscriptions").select("plan,current_period_end").eq("user_id", supabaseUserId).maybeSingle();
    const { error: subError } = await appDb().from("subscriptions").upsert({ user_id: supabaseUserId, status: "cancellato", plan: currentSub?.plan ?? "base", seats_count: 1, cancel_at_period_end: true, current_period_end: currentSub?.current_period_end ?? new Date().toISOString() }, { onConflict: "user_id" });
    if (subError) throw new Error(subError.message);
    return { success: true };
  }),
  mySubscription: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { data, error } = await appDb().from("subscriptions").select("id,user_id,status,plan,seats_count,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at").eq("user_id", supabaseUserId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
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
  updatePlan: authedQuery.input(z.object({ piano: z.enum(["trial", "base"]), seatsCount: z.number().min(1).optional() })).mutation(async ({ ctx, input }) => {
    const planLimits: Record<string, number> = { trial: 15, base: 100 };
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const seatsCount = input.seatsCount ?? 1;
    const { data: existingSub, error: existingSubError } = await appDb().from("subscriptions").select("status,plan,created_at,current_period_start").eq("user_id", supabaseUserId).maybeSingle();
    if (existingSubError) throw new Error(existingSubError.message);
    if (input.piano === "trial" && existingSub) {
      throw new Error("Il trial può essere attivato una sola volta per account");
    }

    const { error: profileError } = await appDb().from("profiles").update({ piano: input.piano, seats: seatsCount }).eq("id", supabaseUserId);
    if (profileError) throw new Error(profileError.message);
    const status = input.piano === "trial" ? "trial" : "attivo";
    const now = new Date().toISOString();
    const periodEnd = input.piano === "trial"
      ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: subError } = await appDb().from("subscriptions").upsert({ user_id: supabaseUserId, status, plan: input.piano, seats_count: seatsCount, current_period_start: existingSub?.current_period_start ?? now, current_period_end: periodEnd, cancel_at_period_end: false }, { onConflict: "user_id" });
    if (subError) throw new Error(subError.message);
    ctx.user.piano = input.piano;
    ctx.user.seats = seatsCount;
    return { piano: input.piano, limit: planLimits[input.piano] ?? 5 };
  }),
});
