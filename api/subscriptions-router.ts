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
    const { error: profileError } = await appDb().from("profiles").update({ piano: "trial", seats: 1 }).eq("id", supabaseUserId);
    if (profileError) throw new Error(profileError.message);
    const { error: subError } = await appDb().from("subscriptions").upsert({ user_id: supabaseUserId, status: "cancellato", plan: "trial", seats_count: 1, cancel_at_period_end: true }, { onConflict: "user_id" });
    if (subError) throw new Error(subError.message);
    ctx.user.piano = "trial";
    ctx.user.seats = 1;
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
    const { error: profileError } = await appDb().from("profiles").update({ piano: input.piano, seats: seatsCount }).eq("id", supabaseUserId);
    if (profileError) throw new Error(profileError.message);
    const status = input.piano === "trial" ? "trial" : "attivo";
    const { error: subError } = await appDb().from("subscriptions").upsert({ user_id: supabaseUserId, status, plan: input.piano, seats_count: seatsCount, cancel_at_period_end: false }, { onConflict: "user_id" });
    if (subError) throw new Error(subError.message);
    ctx.user.piano = input.piano;
    ctx.user.seats = seatsCount;
    return { piano: input.piano, limit: planLimits[input.piano] ?? 5 };
  }),
});
