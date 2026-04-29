import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { getDb } from "./queries/connection";
import { patients } from "@db/schema";
import { eq, desc } from "drizzle-orm";

export const patientsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(patients)
      .where(eq(patients.userId, ctx.user.id))
      .orderBy(desc(patients.createdAt));
  }),

  create: authedQuery
    .input(
      z.object({
        aliasEta: z.string().max(50).optional(),
        noteAnonime: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db
        .insert(patients)
        .values({
          userId: ctx.user.id,
          aliasEta: input.aliasEta ?? null,
          noteAnonime: input.noteAnonime ?? null,
        })
        .$returningId();
      const rows = await db
        .select()
        .from(patients)
        .where(eq(patients.id, result[0].id))
        .limit(1);
      return rows[0];
    }),

  detail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(patients)
        .where(eq(patients.id, input.id))
        .limit(1);
      const patient = rows[0];
      if (!patient) throw new Error("Patient not found");
      if (patient.userId !== ctx.user.id) throw new Error("Unauthorized");
      return patient;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(patients)
        .where(eq(patients.id, input.id))
        .limit(1);
      const patient = rows[0];
      if (!patient) throw new Error("Patient not found");
      if (patient.userId !== ctx.user.id) throw new Error("Unauthorized");
      await db.delete(patients).where(eq(patients.id, input.id));
      return { success: true };
    }),
});
