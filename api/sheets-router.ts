import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { createDidacticPdf } from "./lib/pdf";
import { getDb } from "./queries/connection";
import { illustrations, sheets } from "@db/schema";
import { eq, desc, and, like } from "drizzle-orm";

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

  generatePdf: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(sheets)
        .where(eq(sheets.id, input.id))
        .limit(1);
      const sheet = rows[0];
      if (!sheet) throw new Error("Sheet not found");
      if (sheet.userId !== ctx.user.id) throw new Error("Unauthorized");

      let illustrationLabel = sheet.tagImmagine ?? "generico";
      if (sheet.tagImmagine) {
        const illRows = await db
          .select()
          .from(illustrations)
          .where(eq(illustrations.tag, sheet.tagImmagine))
          .limit(1);
        const fuzzy = illRows[0]
          ? illRows
          : await db
              .select()
              .from(illustrations)
              .where(like(illustrations.tag, `%${sheet.tagImmagine}%`))
              .limit(1);
        if (fuzzy[0]) {
          illustrationLabel = `${fuzzy[0].tag} (${fuzzy[0].filePath})`;
        }
      }

      const doctorName = [ctx.user.firstName, ctx.user.lastName].filter(Boolean).join(" ")
        || ctx.user.name
        || "Nome Utente";
      const bytes = createDidacticPdf({
        title: "LogopediPro",
        subtitle: "Scheda didattica personalizzata",
        fonema: sheet.fonema,
        interesse: sheet.interesse,
        difficolta: sheet.difficolta ?? "media",
        content: sheet.testoGenerato,
        words: (sheet.listaParole as string[] | null) ?? [],
        illustrationLabel,
        watermarkDoctor: doctorName,
      });

      const base64 = Buffer.from(bytes).toString("base64");
      return {
        fileName: `scheda-${sheet.id}.pdf`,
        data: base64,
      };
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
        .returning({ id: sheets.id });
      const rows = await db
        .select()
        .from(sheets)
        .where(eq(sheets.id, result[0].id))
        .limit(1);
      return rows[0];
    }),
});
