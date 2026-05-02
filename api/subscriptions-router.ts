import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { subscriptions, users } from "./store";

export const subscriptionsRouter = createRouter({
  cancel: authedQuery.mutation(async ({ ctx }) => {
    const user = users.find((u) => u.id === ctx.user.id);
    if (user) { user.piano = "trial"; user.seats = 1; }
    const sub = subscriptions.find((s) => s.userId === ctx.user.id);
    if (sub) { sub.status = "cancellato"; sub.seatsCount = 1; }
    return { success: true };
  }),
  mySubscription: authedQuery.query(async ({ ctx }) => subscriptions.find((s)=>s.userId===ctx.user.id) ?? null),
  updatePlan: authedQuery.input(z.object({ piano: z.enum(["trial", "base"]), seatsCount: z.number().min(1).optional() })).mutation(async ({ ctx, input }) => {
    const planLimits: Record<string, number> = { trial: 10, base: 100 };
    const user = users.find((u) => u.id === ctx.user.id);
    if (user) { user.piano = input.piano; user.seats = input.seatsCount ?? 1; }
    const sub = subscriptions.find((s)=>s.userId===ctx.user.id);
    if (sub) { sub.status = input.piano === "trial" ? "trial" : "attivo"; sub.seatsCount = input.seatsCount ?? 1; }
    else subscriptions.push({ userId: ctx.user.id, status: input.piano === "trial" ? "trial" : "attivo", seatsCount: input.seatsCount ?? 1 });
    return { piano: input.piano, limit: planLimits[input.piano] ?? 5 };
  }),
});
