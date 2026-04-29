import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { getDb } from "./queries/connection";
import { sheets } from "@db/schema";
import { eq, desc, and } from "drizzle-orm";

export const sheetsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(sheets)
      .where(eq(sheets.userId, ctx.user.id))
      .orderBy(desc(sheets.createdAt));
  }),

  listByPatient: authedQuery
    .input(z.object({ patientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(sheets)
        .where(
          and(
            eq(sheets.userId, ctx.user.id),
            eq(sheets.patientId, input.patientId)
          )
        )
        .orderBy(desc(sheets.createdAt));
    }),

  detail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(sheets)
        .where(eq(sheets.id, input.id))
        .limit(1);
      const sheet = rows[0];
      if (!sheet) throw new Error("Sheet not found");
      if (sheet.userId !== ctx.user.id) throw new Error("Unauthorized");
      return sheet;
    }),

  create: authedQuery
    .input(
      z.object({
        patientId: z.number().optional(),
        fonema: z.string().max(10),
        interesse: z.string().max(100),
        tipoOutput: z.enum(["storia", "filastrocca", "lista"]),
        testoGenerato: z.string(),
        tagImmagine: z.string().max(100).optional(),
        listaParole: z.array(z.string()).optional(),
        difficolta: z.enum(["bassa", "media", "alta"]).optional(),
        pdfUrl: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db
        .insert(sheets)
        .values({
          userId: ctx.user.id,
          patientId: input.patientId ?? null,
          fonema: input.fonema,
          interesse: input.interesse,
          tipoOutput: input.tipoOutput,
          testoGenerato: input.testoGenerato,
          tagImmagine: input.tagImmagine ?? null,
          listaParole: input.listaParole ?? null,
          difficolta: input.difficolta ?? "media",
          pdfUrl: input.pdfUrl ?? null,
        })
        .$returningId();
      const rows = await db
        .select()
        .from(sheets)
        .where(eq(sheets.id, result[0].id))
        .limit(1);
      return rows[0];
    }),
});
