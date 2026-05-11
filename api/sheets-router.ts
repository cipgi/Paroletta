import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { createDidacticPdf } from "./lib/pdf";
import { illustrations } from "./store";
import { appDb, getSupabaseUserIdFromUnionId } from "./lib/db";
import {
  databaseOperationError,
  invalidSessionError,
  missingResourceError,
} from "./lib/errors";
import { sanitizeProfileNameOrFallback } from "./lib/sanitize";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw invalidSessionError();
  return id;
}

type DbSheet = {
  id: string;
  user_id: string;
  fonema: string;
  interesse: string;
  tipo_output: string;
  testo_generato: string;
  tag_immagine: string | null;
  lista_parole: string[] | null;
  difficolta: string;
  pdf_url: string | null;
  created_at: string;
};

const mapSheet = (s: DbSheet) => ({
  id: s.id,
  userId: s.user_id,
  fonema: s.fonema,
  interesse: s.interesse,
  tipoOutput: s.tipo_output,
  testoGenerato: s.testo_generato,
  tagImmagine: s.tag_immagine,
  listaParole: s.lista_parole,
  difficolta: s.difficolta,
  pdfUrl: s.pdf_url,
  createdAt: new Date(s.created_at),
});

export const sheetsRouter = createRouter({
  count: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { count, error } = await appDb(ctx.supabaseAccessToken)
      .from("sheets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId);
    if (error) throw databaseOperationError("caricare le schede", error);
    return count ?? 0;
  }),
  list: authedQuery.query(async ({ ctx }) => {
    const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
    const { data, error } = await appDb(ctx.supabaseAccessToken)
      .from("sheets")
      .select("*")
      .eq("user_id", supabaseUserId)
      .order("created_at", { ascending: false });
    if (error)
      throw databaseOperationError("caricare l’elenco delle schede", error);
    return (data ?? []).map(mapSheet);
  }),
  detail: authedQuery
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("*")
        .eq("id", input.id)
        .eq("user_id", supabaseUserId)
        .single();
      if (error || !data) throw missingResourceError("Scheda");
      return mapSheet(data);
    }),
  generatePdf: authedQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("*")
        .eq("id", input.id)
        .eq("user_id", supabaseUserId)
        .single();
      if (error || !data) throw missingResourceError("Scheda");
      const sheet = mapSheet(data);
      let illustrationLabel = sheet.tagImmagine ?? "generico";
      if (sheet.tagImmagine) {
        const fuzzy =
          illustrations.find(i => i.tag === sheet.tagImmagine) ??
          illustrations.find(i => i.tag.includes(sheet.tagImmagine!));
        if (fuzzy) illustrationLabel = `${fuzzy.tag} (${fuzzy.filePath})`;
      }
      const doctorName = sanitizeProfileNameOrFallback(
        [ctx.user.firstName, ctx.user.lastName].filter(Boolean).join(" ") ||
          ctx.user.name,
        "Nome Utente"
      );
      const bytes = createDidacticPdf({
        title: "Paroletta",
        subtitle: "Scheda didattica personalizzata",
        fonema: sheet.fonema,
        interesse: sheet.interesse,
        difficolta: sheet.difficolta ?? "media",
        content: sheet.testoGenerato,
        words: sheet.listaParole ?? [],
        illustrationLabel,
        watermarkDoctor: doctorName,
        tipoOutput: sheet.tipoOutput,
      });
      return {
        fileName: `scheda-${sheet.id}.pdf`,
        data: Buffer.from(bytes).toString("base64"),
      };
    }),
  create: authedQuery
    .input(
      z.object({
        fonema: z.string().max(10),
        interesse: z.string().max(100),
        tipoOutput: z.enum([
          "storia",
          "filastrocca",
          "lista",
          "discriminazione_visiva",
          "morfosintassi_complessa",
        ]),
        testoGenerato: z.string(),
        tagImmagine: z.string().max(100).optional(),
        listaParole: z.array(z.string()).optional(),
        difficolta: z.enum(["bassa", "media", "alta"]).optional(),
        pdfUrl: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      return {
        id: crypto.randomUUID(),
        userId: supabaseUserId,
        fonema: input.fonema,
        interesse: input.interesse,
        tipoOutput: input.tipoOutput,
        testoGenerato: input.testoGenerato,
        tagImmagine: input.tagImmagine ?? null,
        listaParole: input.listaParole ?? null,
        difficolta: input.difficolta ?? "media",
        pdfUrl: input.pdfUrl ?? null,
        createdAt: new Date(),
      };
    }),
});
