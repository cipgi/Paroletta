import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { createDidacticPdf } from "./lib/pdf";
import { sheets, illustrations, nextSheetId } from "./store";

export const sheetsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => sheets.filter((s)=>s.userId===ctx.user.id).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime())),
  listByPatient: authedQuery.input(z.object({ patientId: z.number() })).query(async ({ ctx, input }) => sheets.filter((s)=>s.userId===ctx.user.id && s.patientId===input.patientId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime())),
  detail: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => { const sheet=sheets.find((s)=>s.id===input.id); if(!sheet) throw new Error("Sheet not found"); if(sheet.userId!==ctx.user.id) throw new Error("Unauthorized"); return sheet; }),
  generatePdf: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const sheet=sheets.find((s)=>s.id===input.id); if(!sheet) throw new Error("Sheet not found"); if(sheet.userId!==ctx.user.id) throw new Error("Unauthorized");
    let illustrationLabel = sheet.tagImmagine ?? "generico";
    if (sheet.tagImmagine) { const fuzzy = illustrations.find((i)=>i.tag===sheet.tagImmagine) ?? illustrations.find((i)=>i.tag.includes(sheet.tagImmagine!)); if (fuzzy) illustrationLabel = `${fuzzy.tag} (${fuzzy.filePath})`; }
    const doctorName = [ctx.user.firstName, ctx.user.lastName].filter(Boolean).join(" ") || ctx.user.name || "Nome Utente";
    const bytes = createDidacticPdf({ title:"LogopediPro", subtitle:"Scheda didattica personalizzata", fonema: sheet.fonema, interesse: sheet.interesse, difficolta: sheet.difficolta ?? "media", content: sheet.testoGenerato, words: sheet.listaParole ?? [], illustrationLabel, watermarkDoctor: doctorName });
    return { fileName: `scheda-${sheet.id}.pdf`, data: Buffer.from(bytes).toString("base64") };
  }),
  create: authedQuery.input(z.object({ patientId: z.number().optional(), fonema: z.string().max(10), interesse: z.string().max(100), tipoOutput: z.enum(["storia", "filastrocca", "lista"]), testoGenerato: z.string(), tagImmagine: z.string().max(100).optional(), listaParole: z.array(z.string()).optional(), difficolta: z.enum(["bassa", "media", "alta"]).optional(), pdfUrl: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
    const sheet = { id: nextSheetId(), userId: ctx.user.id, patientId: input.patientId ?? null, fonema: input.fonema, interesse: input.interesse, tipoOutput: input.tipoOutput, testoGenerato: input.testoGenerato, tagImmagine: input.tagImmagine ?? null, listaParole: input.listaParole ?? null, difficolta: input.difficolta ?? "media", pdfUrl: input.pdfUrl ?? null, createdAt: new Date() };
    sheets.push(sheet); return sheet;
  }),
});
