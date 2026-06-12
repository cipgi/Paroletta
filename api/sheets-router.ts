import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { createDidacticPdf } from "./lib/pdf";
import { illustrations } from "./store";
import { adminAppDb, appDb, getSupabaseUserIdFromUnionId } from "./lib/db";
import {
  databaseOperationError,
  invalidSessionError,
  missingResourceError,
} from "./lib/errors";
import {
  canOmitSheetImages,
  getUserFacingSheetContent,
  parseUnifiedSheetContent,
} from "@contracts/sheet-content";
import { sanitizeProfileNameOrFallback } from "./lib/sanitize";
import { getAccountContext } from "./lib/organization";
import { createSupabaseImageCacheDb } from "./lib/illustration-cache-db";
import { createSupabaseImageObjectStorage } from "./lib/image-storage";
import { supabaseAdmin } from "./lib/supabase";
import {
  buildSemanticCacheKey,
  buildImageRequests,
  resolveImageRequestWithCache,
} from "./lib/image-generation";
import {
  generateUnifiedSheetFromParams,
  sanitizeGenerationParams,
  type TipoOutput,
} from "./ai-router";
import {
  assertActiveSubscription,
  reserveImageGenerationQuota,
} from "./lib/subscription";

function requireSupabaseUserId(unionId: string) {
  const id = getSupabaseUserIdFromUnionId(unionId);
  if (!id) throw invalidSessionError();
  return id;
}

async function assertCanManageSheetOwner(
  currentUserId: string,
  sheetOwnerUserId: string,
  accessToken?: string
) {
  if (currentUserId === sheetOwnerUserId) return;

  const account = await getAccountContext(currentUserId, accessToken);
  if (account.role !== "manager" || account.ownerUserId !== currentUserId) {
    throw missingResourceError("Scheda");
  }

  const { data, error } = await appDb(accessToken)
    .from("seat_assignments")
    .select("id")
    .eq("owner_user_id", currentUserId)
    .eq("member_user_id", sheetOwnerUserId)
    .maybeSingle();

  if (error)
    throw databaseOperationError("verificare l'accesso al team", error);
  if (!data) throw missingResourceError("Scheda");
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

function getVisualOptionCount(words: string[] | null) {
  const count = (words ?? []).filter(word =>
    /^(target|distrattore)/i.test(word.trim())
  ).length;
  return Math.min(Math.max(count || 4, 2), 4);
}

function getNarrativeSceneCount(words: string[] | null) {
  const count = (words ?? []).filter(word =>
    /^scena\s+\d+/i.test(word.trim())
  ).length;
  return Math.min(Math.max(count || 4, 3), 5);
}

function toRegenerableTipoOutput(tipoOutput: string): TipoOutput {
  if (tipoOutput === "morfosintassi_complessa") return tipoOutput;
  if (tipoOutput === "morfosintassi") return tipoOutput;
  if (tipoOutput === "narrazione_sequenze") return tipoOutput;
  if (tipoOutput === "pragmatica") return tipoOutput;
  if (tipoOutput === "discriminazione_visiva") return tipoOutput;
  if (tipoOutput === "storia") return tipoOutput;
  if (tipoOutput === "filastrocca") return tipoOutput;
  if (tipoOutput === "lista") return tipoOutput;
  if (tipoOutput === "lista_parole") return tipoOutput;
  throw missingResourceError("Tipo scheda");
}

function getRegenerationAgeRange(difficulty: string | null | undefined) {
  const normalized = (difficulty ?? "").toLocaleLowerCase("it-IT");
  if (normalized === "bassa" || normalized === "facile") return "3-5 anni";
  if (normalized === "alta" || normalized === "difficile") return "9-11 anni";
  return "6-8 anni";
}

type ImageQuotaContext = {
  userId: string;
  accessToken?: string;
};

async function reserveImageQuotaForCurrentUser(quota: ImageQuotaContext) {
  const account = await getAccountContext(quota.userId, quota.accessToken);
  const subscription = await assertActiveSubscription({
    ownerUserId: account.ownerUserId,
    accessToken: quota.accessToken,
  });

  return reserveImageGenerationQuota({
    userId: quota.userId,
    plan: subscription.plan ?? "sviluppo",
    accessToken: quota.accessToken,
  });
}

async function resolveSheetImageAssets(
  sheet: ReturnType<typeof mapSheet>,
  quota: ImageQuotaContext
) {
  const imageRequests = buildImageRequests({
    tipoOutput: sheet.tipoOutput,
    interesse: sheet.interesse,
    tagImmagine: sheet.tagImmagine,
    testoGenerato: sheet.testoGenerato,
    numeroOpzioni:
      sheet.tipoOutput === "discriminazione_visiva"
        ? getVisualOptionCount(sheet.listaParole)
        : undefined,
  });
  const imageStorage = createSupabaseImageObjectStorage(supabaseAdmin);
  const imageCacheDb = createSupabaseImageCacheDb(adminAppDb(), {
    imageStorage,
  });

  return Promise.all(
    imageRequests.map(async request => {
      const illustration = await resolveImageRequestWithCache(
        request,
        imageCacheDb,
        {
          imageStorage,
          onGenerateStart: () => reserveImageQuotaForCurrentUser(quota),
        }
      );
      return {
        role: request.role,
        label: request.label,
        semanticTags: illustration.semanticTags,
        cacheKey: illustration.cacheKey,
        filePath: illustration.filePath,
        source: illustration.source,
        storageBucket: illustration.storageBucket ?? null,
        storagePath: illustration.storagePath ?? null,
        fallbackReason: illustration.fallbackReason ?? null,
        cacheHit: illustration.cacheHit,
      };
    })
  );
}
const managedSheetListInput = z
  .object({
    userId: z.string().uuid().optional(),
    allTeam: z.boolean().optional(),
  })
  .optional();

export const sheetsRouter = createRouter({
  count: authedQuery
    .input(managedSheetListInput)
    .query(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const targetUserId = input?.userId ?? supabaseUserId;
      await assertCanManageSheetOwner(
        supabaseUserId,
        targetUserId,
        ctx.supabaseAccessToken
      );
      const { count, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", targetUserId);
      if (error) throw databaseOperationError("caricare le schede", error);
      return count ?? 0;
    }),
  list: authedQuery
    .input(managedSheetListInput)
    .query(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const db = appDb(ctx.supabaseAccessToken);

      if (input?.allTeam) {
        const account = await getAccountContext(
          supabaseUserId,
          ctx.supabaseAccessToken
        );
        if (
          account.role !== "manager" ||
          account.ownerUserId !== supabaseUserId
        ) {
          throw missingResourceError("Schede del team");
        }

        const { data: members, error: membersError } = await db
          .from("seat_assignments")
          .select("member_user_id")
          .eq("owner_user_id", supabaseUserId);
        if (membersError)
          throw databaseOperationError(
            "caricare i membri del team",
            membersError
          );

        const teamUserIds = [
          supabaseUserId,
          ...(members ?? []).map(member => member.member_user_id),
        ];
        const { data, error } = await db
          .from("sheets")
          .select("*")
          .in("user_id", teamUserIds)
          .order("created_at", { ascending: false });
        if (error)
          throw databaseOperationError("caricare l’elenco delle schede", error);
        return (data ?? []).map(mapSheet);
      }

      const targetUserId = input?.userId ?? supabaseUserId;
      await assertCanManageSheetOwner(
        supabaseUserId,
        targetUserId,
        ctx.supabaseAccessToken
      );
      const { data, error } = await db
        .from("sheets")
        .select("*")
        .eq("user_id", targetUserId)
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
        .single();
      if (error || !data) throw missingResourceError("Scheda");
      await assertCanManageSheetOwner(
        supabaseUserId,
        data.user_id,
        ctx.supabaseAccessToken
      );
      const sheet = mapSheet(data);
      const imageAssets = await resolveSheetImageAssets(sheet, {
        userId: supabaseUserId,
        accessToken: ctx.supabaseAccessToken,
      });
      return { ...sheet, imageAssets };
    }),
  regenerateImage: authedQuery
    .input(z.object({ id: z.string().uuid(), cacheKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("*")
        .eq("id", input.id)
        .single();
      if (error || !data) throw missingResourceError("Scheda");
      await assertCanManageSheetOwner(
        supabaseUserId,
        data.user_id,
        ctx.supabaseAccessToken
      );
      const sheet = mapSheet(data);
      const imageRequests = buildImageRequests({
        tipoOutput: sheet.tipoOutput,
        interesse: sheet.interesse,
        tagImmagine: sheet.tagImmagine,
        testoGenerato: sheet.testoGenerato,
        numeroOpzioni:
          sheet.tipoOutput === "discriminazione_visiva"
            ? getVisualOptionCount(sheet.listaParole)
            : undefined,
      });
      const request = imageRequests.find(
        item => buildSemanticCacheKey(item.semanticTags) === input.cacheKey
      );
      if (!request) throw missingResourceError("Immagine");

      const imageStorage = createSupabaseImageObjectStorage(supabaseAdmin);
      const imageCacheDb = createSupabaseImageCacheDb(adminAppDb(), {
        imageStorage,
      });
      const illustration = await resolveImageRequestWithCache(
        request,
        imageCacheDb,
        {
          force: true,
          imageStorage,
          onGenerateStart: async () =>
            reserveImageQuotaForCurrentUser({
              userId: supabaseUserId,
              accessToken: ctx.supabaseAccessToken,
            }),
        }
      );

      return {
        role: request.role,
        label: request.label,
        semanticTags: illustration.semanticTags,
        cacheKey: illustration.cacheKey,
        filePath: illustration.filePath,
        source: illustration.source,
        storageBucket: illustration.storageBucket ?? null,
        storagePath: illustration.storagePath ?? null,
        fallbackReason: illustration.fallbackReason ?? null,
        cacheHit: illustration.cacheHit,
      };
    }),
  regenerateText: authedQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("*")
        .eq("id", input.id)
        .single();
      if (error || !data) throw missingResourceError("Scheda");
      await assertCanManageSheetOwner(
        supabaseUserId,
        data.user_id,
        ctx.supabaseAccessToken
      );
      const sheet = mapSheet(data);
      const parsedSheetContent = parseUnifiedSheetContent(sheet.testoGenerato);
      const includeImages =
        !parsedSheetContent ||
        !canOmitSheetImages(parsedSheetContent.tipo) ||
        parsedSheetContent.immagini.length > 0;
      const sanitizedInput = sanitizeGenerationParams({
        eta: getRegenerationAgeRange(sheet.difficolta),
        fonema: sheet.fonema,
        interesse: sheet.interesse,
        tipoOutput: toRegenerableTipoOutput(sheet.tipoOutput),
        scenarioSmart:
          sheet.interesse === "nessuno" ? sheet.testoGenerato : undefined,
        numeroOpzioni:
          sheet.tipoOutput === "discriminazione_visiva"
            ? getVisualOptionCount(sheet.listaParole)
            : undefined,
        numeroScene:
          sheet.tipoOutput === "narrazione_sequenze"
            ? getNarrativeSceneCount(sheet.listaParole)
            : undefined,
        includeImages,
      });
      const generatedSheet =
        await generateUnifiedSheetFromParams(sanitizedInput);
      const { data: updated, error: updateError } = await appDb(
        ctx.supabaseAccessToken
      )
        .from("sheets")
        .update({
          testo_generato: generatedSheet.serializedSheet,
          tag_immagine: generatedSheet.tagImmagine,
          lista_parole: generatedSheet.words,
          pdf_url: null,
        })
        .eq("id", input.id)
        .select("*")
        .single();

      if (updateError || !updated) {
        throw databaseOperationError(
          "rigenerare il testo della scheda",
          updateError
        );
      }

      const updatedSheet = mapSheet(updated);
      const imageAssets = await resolveSheetImageAssets(updatedSheet, {
        userId: supabaseUserId,
        accessToken: ctx.supabaseAccessToken,
      });
      return { ...updatedSheet, imageAssets };
    }),
  generatePdf: authedQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabaseUserId = requireSupabaseUserId(ctx.user.unionId);
      const { data, error } = await appDb(ctx.supabaseAccessToken)
        .from("sheets")
        .select("*")
        .eq("id", input.id)
        .single();
      if (error || !data) throw missingResourceError("Scheda");
      await assertCanManageSheetOwner(
        supabaseUserId,
        data.user_id,
        ctx.supabaseAccessToken
      );
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
      const parsedSheetContent = parseUnifiedSheetContent(sheet.testoGenerato);
      const includeImageSections =
        !parsedSheetContent || parsedSheetContent.immagini.length > 0;
      const bytes = createDidacticPdf({
        title: "Paroletta",
        subtitle: "Scheda didattica personalizzata",
        fonema: sheet.fonema,
        interesse: sheet.interesse,
        difficolta: sheet.difficolta ?? "media",
        content: getUserFacingSheetContent({
          tipoOutput: sheet.tipoOutput,
          testoGenerato: sheet.testoGenerato,
        }),
        words: sheet.listaParole ?? [],
        illustrationLabel,
        watermarkDoctor: doctorName,
        tipoOutput: sheet.tipoOutput,
        includeImageSections,
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
          "narrazione_sequenze",
          "pragmatica",
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
