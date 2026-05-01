import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { getDb } from "./queries/connection";
import { subscriptions, users } from "@db/schema";
import { eq } from "drizzle-orm";

export const subscriptionsRouter = createRouter({
  cancel: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();

    await db
      .update(users)
      .set({
        piano: "trial",
        seats: 1,
      })
      .where(eq(users.id, ctx.user.id));

    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (rows[0]) {
      await db
        .update(subscriptions)
        .set({
          status: "cancellato",
          seatsCount: 1,
        })
        .where(eq(subscriptions.userId, ctx.user.id));
    }

    return { success: true };
  }),
  mySubscription: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);
    return rows[0] ?? null;
  }),

  updatePlan: authedQuery
    .input(
      z.object({
        piano: z.enum(["trial", "base"]),
        seatsCount: z.number().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const planLimits: Record<string, number> = {
        trial: 10,
        base: 100,
      };
      await db
        .update(users)
        .set({
          piano: input.piano,
          seats: input.seatsCount ?? 1,
        })
        .where(eq(users.id, ctx.user.id));

      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.user.id))
        .limit(1);

      if (rows[0]) {
        await db
          .update(subscriptions)
          .set({
            status: input.piano === "trial" ? "trial" : "attivo",
            seatsCount: input.seatsCount ?? 1,
          })
          .where(eq(subscriptions.userId, ctx.user.id));
      } else {
        await db.insert(subscriptions).values({
          userId: ctx.user.id,
          status: input.piano === "trial" ? "trial" : "attivo",
          seatsCount: input.seatsCount ?? 1,
        });
      }

      return { piano: input.piano, limit: planLimits[input.piano] ?? 5 };
    }),
});
